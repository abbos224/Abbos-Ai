import { v4 as uuid } from 'uuid';
import { getJob, updateJob, setClips, updateClip, type Clip } from './store.js';
import { probe } from './ffmpegRunner.js';
import { transcribeVideo } from './transcription.js';
import { findBestClips } from './analysis.js';
import { renderClip } from './videoPipeline.js';
import { getActivePersona } from './personas.js';

// Weighted rather than a plain average — hook and retention most directly drive whether a viewer
// (or the algorithm) keeps watching past the first few seconds, so they count for more than the
// other four dimensions. Not a scientifically-derived weighting, just a defensible product call;
// weights sum to 1.
const SCORE_WEIGHTS: Record<keyof Clip['scoreBreakdown'], number> = {
  hook: 0.25,
  retention: 0.25,
  emotion: 0.15,
  clarity: 0.15,
  shareability: 0.1,
  cta: 0.1,
};

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

/** Clamps every raw sub-score to 0-100 in case the model ever returns something out of range. */
function clampBreakdown(scores: Clip['scoreBreakdown']): Clip['scoreBreakdown'] {
  return {
    hook: clampScore(scores.hook),
    retention: clampScore(scores.retention),
    emotion: clampScore(scores.emotion),
    clarity: clampScore(scores.clarity),
    shareability: clampScore(scores.shareability),
    cta: clampScore(scores.cta),
  };
}

function weightedScore(scores: Clip['scoreBreakdown']): number {
  const total = (Object.keys(SCORE_WEIGHTS) as Array<keyof Clip['scoreBreakdown']>).reduce(
    (sum, key) => sum + scores[key] * SCORE_WEIGHTS[key],
    0,
  );
  return clampScore(total);
}

// Clips are independent (each only reads the shared source file + words, and writes its own
// work directory), but each render is ~6-8 sequential CPU-bound ffmpeg encodes — rendering them
// one at a time was the main reason "Processing" took so long. RENDER_CONCURRENCY caps how many
// render concurrently rather than firing all of them via Promise.all: several full x264 encodes
// contending for the same CPU cores at once would make each individual encode slower, eating into
// the wall-clock win. 3 is a starting point, not measured against a specific core count.
const RENDER_CONCURRENCY = 3;

async function renderClipsConcurrently(
  userId: string,
  jobId: string,
  clips: Clip[],
  sourceFile: string,
  words: Awaited<ReturnType<typeof transcribeVideo>>,
): Promise<void> {
  let next = 0;
  async function worker() {
    while (next < clips.length) {
      const clip = clips[next++];
      try {
        await updateClip(userId, jobId, clip.id, { status: 'rendering' });
        const { outputFile, coverImages } = await renderClip(userId, sourceFile, clip, words);
        await updateClip(userId, jobId, clip.id, { status: 'done', outputFile, coverImages });
      } catch (err) {
        await updateClip(userId, jobId, clip.id, {
          status: 'failed',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(RENDER_CONCURRENCY, clips.length) }, worker));
}

export async function processJob(userId: string, jobId: string): Promise<void> {
  const job = await getJob(userId, jobId);
  if (!job) throw new Error(`Job not found: ${jobId}`);

  try {
    const { durationSec, width, height } = await probe(job.sourceFile);
    await updateJob(userId, jobId, { durationSec, width, height, status: 'transcribing' });

    const words = await transcribeVideo(job.sourceFile);

    await updateJob(userId, jobId, { status: 'analyzing' });
    const candidates = await findBestClips(words, durationSec, await getActivePersona(userId));

    const clips: Clip[] = candidates.map((c) => {
      const scoreBreakdown = clampBreakdown(c.score_breakdown);
      return {
        id: uuid(),
        jobId,
        startTime: c.start_sec,
        endTime: c.end_sec,
        topic: c.topic,
        score: weightedScore(scoreBreakdown),
        scoreBreakdown,
        scoreRationale: c.score_rationale,
        hookOptions: c.hook_options,
        chosenHook: c.hook_options[0] ?? c.topic,
        cta: c.cta,
        coverOptions: c.cover_options,
        socialCaption: c.social_caption,
        status: 'pending',
      };
    });
    await setClips(userId, jobId, clips);

    await updateJob(userId, jobId, { status: 'rendering' });
    await renderClipsConcurrently(userId, jobId, clips, job.sourceFile, words);

    await updateJob(userId, jobId, { status: 'done' });
  } catch (err) {
    await updateJob(userId, jobId, {
      status: 'failed',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
