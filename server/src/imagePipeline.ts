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
    const message = err instanceof Error ? err.message : String(err);
    // If even this write fails (e.g. a transient DB blip), the job would otherwise be stuck in
    // 'generating' forever — permanently consuming one of the account's free generations with no
    // way to retry it. One retry after a short delay covers the transient case; if it still
    // fails, the error is at least loud in the logs with the job id for manual follow-up.
    try {
      await updateImageJob(userId, imageJobId, { status: 'failed', error: message });
    } catch (writeErr) {
      console.error(`Image job ${imageJobId}: failed to record failure, retrying once:`, writeErr);
      await new Promise((resolve) => setTimeout(resolve, 2000));
      try {
        await updateImageJob(userId, imageJobId, { status: 'failed', error: message });
      } catch (retryErr) {
        console.error(`Image job ${imageJobId}: still stuck in 'generating' — retry also failed:`, retryErr);
      }
    }
  }
}
