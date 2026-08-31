import { getAnthropicClient } from './anthropicClient.js';

export type Language = { code: string; label: string };

export const SUPPORTED_LANGUAGES: Language[] = [
  { code: 'en', label: 'English' },
  { code: 'ru', label: 'Russian' },
  { code: 'ar', label: 'Arabic' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
];

export type TranslatedCaptions = { cues: string[]; hook: string; cta?: string };

/**
 * Translates a clip's caption cues, hook line, and (optionally) CTA into another language,
 * preserving cue count and order (so each translated cue can be dropped into the same timing slot
 * as the original) while still giving the model the full picture for a coherent, natural
 * translation.
 */
export async function translateCaptions(
  cueTexts: string[],
  hookText: string,
  targetLanguage: string,
  ctaText?: string,
): Promise<TranslatedCaptions> {
  const message = await getAnthropicClient().messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 2048,
    system:
      `You translate short-form video captions, hooks, and calls-to-action into ${targetLanguage}. ` +
      'Keep the punchy, attention-grabbing tone of the original — this is for a social media Reel, ' +
      'not a formal document. Respond with ONLY valid JSON (no markdown fences, no commentary) ' +
      'matching this shape exactly: { "hook": string, "cues": string[], "cta": string | null }. ' +
      '"cues" MUST have exactly the same number of entries, in the same order, as the input cues — ' +
      'each entry is the translation of the corresponding input cue. Use the full list of cues as ' +
      'context for a coherent translation, but keep each translated cue roughly as short as its ' +
      'original so it still fits on screen for the same amount of time. Set "cta" to null if no ' +
      'input CTA was given, otherwise translate it, keeping it just as short and direct.',
    messages: [
      {
        role: 'user',
        content: JSON.stringify({ hook: hookText, cues: cueTexts, cta: ctaText ?? null }),
      },
    ],
  });

  const textBlock = message.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('Claude translation response contained no text block');
  }

  const jsonText = textBlock.text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();

  let parsed: { hook: string; cues: string[]; cta: string | null };
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error(`Failed to parse translation JSON: ${jsonText.slice(0, 500)}`);
  }

  if (!Array.isArray(parsed.cues) || parsed.cues.length !== cueTexts.length) {
    throw new Error(
      `Translation returned ${parsed.cues?.length ?? 'no'} cues, expected ${cueTexts.length}`,
    );
  }

  return { hook: parsed.hook, cues: parsed.cues, cta: parsed.cta ?? undefined };
}
