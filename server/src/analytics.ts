import type { Clip, Job } from './store.js';

export type PublishedEntry = { jobId: string; clip: Clip; videoId: string };

/** Pulls the `v=` video id out of a `https://www.youtube.com/watch?v=...` URL. Pure and easy to
 * unit-test independently of the YouTube API client. */
export function extractYoutubeVideoId(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.searchParams.get('v');
  } catch {
    return null;
  }
}

/** Every clip across every job that has actually been published to YouTube, with its video id
 * already extracted (clips whose URL doesn't parse are skipped rather than surfaced as broken). */
export function getPublishedClips(jobs: Job[]): PublishedEntry[] {
  return jobs
    .flatMap((job) => job.clips.map((clip) => ({ jobId: job.id, clip })))
    .filter((entry): entry is { jobId: string; clip: Clip } => Boolean(entry.clip.publishedYoutubeUrl))
    .map((entry) => ({ ...entry, videoId: extractYoutubeVideoId(entry.clip.publishedYoutubeUrl!) }))
    .filter((entry): entry is PublishedEntry => entry.videoId !== null);
}
