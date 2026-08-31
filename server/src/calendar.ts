import type { Clip, Job } from './store.js';

export type CalendarEntry = { jobId: string; clip: Clip };

/** All "done" clips across every job that have a scheduled date, sorted earliest first. */
export function getScheduledClips(jobs: Job[]): CalendarEntry[] {
  return jobs
    .flatMap((job) => job.clips.map((clip) => ({ jobId: job.id, clip })))
    .filter((entry) => entry.clip.status === 'done' && entry.clip.scheduledFor)
    .sort((a, b) => (a.clip.scheduledFor! < b.clip.scheduledFor! ? -1 : 1));
}

/** "done" clips across every job that have no scheduled date yet — candidates for auto-scheduling. */
export function getUnscheduledDoneClips(jobs: Job[]): CalendarEntry[] {
  return jobs
    .flatMap((job) => job.clips.map((clip) => ({ jobId: job.id, clip })))
    .filter((entry) => entry.clip.status === 'done' && !entry.clip.scheduledFor);
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Suggests `count` future dates, `intervalDays` apart, starting the day after `from`. Pure and
 * unit-tested — posting cadence logic shouldn't need a real clock to verify.
 */
export function suggestScheduleDates(count: number, intervalDays: number, from: Date): string[] {
  const dates: string[] = [];
  for (let i = 1; i <= count; i++) {
    const next = new Date(from);
    next.setDate(next.getDate() + i * intervalDays);
    dates.push(toIsoDate(next));
  }
  return dates;
}
