import { v4 as uuid } from 'uuid';
import { getJob, updateJob, setClips, updateClip, type Clip } from './store.js';
import { probe } from './ffmpegRunner.js';
import { transcribeVideo } from './transcription.js';
import { findBestClips } from './analysis.js';
import { renderClip } from './videoPipeline.js';
import { getActivePersona } from './personas.js';

function average(scores: Clip['scoreBreakdown']): number {
  const values = Object.values(scores);
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

export async function processJob(jobId: string): Promise<void> {
  const job = getJob(jobId);
  if (!job) throw new Error(`Job not found: ${jobId}`);

  try {
    const { durationSec, width, height } = await probe(job.sourceFile);
    updateJob(jobId, { durationSec, width, height, status: 'transcribing' });

    const words = await transcribeVideo(job.sourceFile);

    updateJob(jobId, { status: 'analyzing' });
    const candidates = await findBestClips(words, durationSec, getActivePersona());

    const clips: Clip[] = candidates.map((c) => ({
      id: uuid(),
      jobId,
      startTime: c.start_sec,
      endTime: c.end_sec,
      topic: c.topic,
      score: average(c.score_breakdown),
      scoreBreakdown: c.score_breakdown,
      hookOptions: c.hook_options,
      chosenHook: c.hook_options[0] ?? c.topic,
      cta: c.cta,
      coverOptions: c.cover_options,
      socialCaption: c.social_caption,
      status: 'pending',
    }));
    setClips(jobId, clips);

    updateJob(jobId, { status: 'rendering' });
    for (const clip of clips) {
      try {
        updateClip(jobId, clip.id, { status: 'rendering' });
        const { outputFile, coverImages } = await renderClip(job.sourceFile, clip, words);
        updateClip(jobId, clip.id, { status: 'done', outputFile, coverImages });
      } catch (err) {
        updateClip(jobId, clip.id, {
          status: 'failed',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    updateJob(jobId, { status: 'done' });
  } catch (err) {
    updateJob(jobId, {
      status: 'failed',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
