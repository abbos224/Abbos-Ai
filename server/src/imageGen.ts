import type { Part } from '@google/genai';
import { getGeminiClient } from './geminiClient.js';

// "Nano Banana 2" as of this writing. Confirmed against the installed @google/genai package's
// own type definitions (node_modules/@google/genai/dist/genai.d.ts) — this model exposes image
// generation/editing through the same `models.generateContent` call every other Gemini model
// uses (a text+image multimodal request in, an image part out), not a separate image-only API.
export const GEMINI_IMAGE_MODEL = 'gemini-3.1-flash-image';

export type GeneratedImage = { buffer: Buffer; mimeType: string };

const EXT_BY_MIME: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
};

export function extensionForMimeType(mimeType: string): string {
  return EXT_BY_MIME[mimeType] ?? '.png';
}

/**
 * Generates an image from `prompt` alone, or edits `sourceImage` per `prompt` (Nano Banana's
 * conversational image editing) when one is provided — both go through the same multimodal
 * `generateContent` call, differing only in whether an inline-data image part is included.
 */
export async function generateOrEditImage(
  prompt: string,
  sourceImage?: { buffer: Buffer; mimeType: string },
): Promise<GeneratedImage> {
  const ai = getGeminiClient();

  const parts: Part[] = [];
  if (sourceImage) {
    parts.push({ inlineData: { data: sourceImage.buffer.toString('base64'), mimeType: sourceImage.mimeType } });
  }
  parts.push({ text: prompt });

  const response = await ai.models.generateContent({
    model: GEMINI_IMAGE_MODEL,
    contents: [{ role: 'user', parts }],
  });

  // `response.data` is a convenience getter that concatenates inline-data parts from the first
  // candidate — but it doesn't carry the mimetype, so we still need to walk the raw parts to
  // find it. A "successful" (200) response can still contain no image at all (a safety refusal
  // or a text-only reply) — that's a normal outcome to report clearly, not a crash.
  const imagePart = response.candidates?.[0]?.content?.parts?.find((part) => part.inlineData?.data);
  if (!imagePart?.inlineData?.data) {
    const reason =
      response.promptFeedback?.blockReasonMessage ||
      response.candidates?.[0]?.finishMessage ||
      response.text;
    throw new Error(
      reason
        ? `Gemini did not return an image: ${reason}`
        : 'Gemini did not return an image for this prompt. Try rephrasing it.',
    );
  }

  return {
    buffer: Buffer.from(imagePart.inlineData.data, 'base64'),
    mimeType: imagePart.inlineData.mimeType ?? 'image/png',
  };
}
