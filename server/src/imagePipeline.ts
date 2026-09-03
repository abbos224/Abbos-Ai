import fs from 'node:fs';
import path from 'node:path';
import { env } from './env.js';
import { generateOrEditImage, extensionForMimeType } from './imageGen.js';
import { updateImageJob } from './imageStore.js';

export async function processImageJob(
  userId: string,
  imageJobId: string,
  prompt: string,
  sourceImage?: { buffer: Buffer; mimeType: string },
): Promise<void> {
  try {
    const { buffer, mimeType } = await generateOrEditImage(prompt, sourceImage);
    const ext = extensionForMimeType(mimeType);
    const dir = path.join(env.storageDir, 'images', imageJobId);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `output${ext}`), buffer);

    await updateImageJob(userId, imageJobId, {
      status: 'done',
      outputFile: `/generated-images/${imageJobId}/output${ext}`,
      outputMimeType: mimeType,
    });
  } catch (err) {
    await updateImageJob(userId, imageJobId, {
      status: 'failed',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
