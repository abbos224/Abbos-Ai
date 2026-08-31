import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getScheduledClips, getUnscheduledDoneClips, suggestScheduleDates } from './calendar.js';
import type { Clip, Job } from './store.js';

function clip(overrides: Partial<Clip>): Clip {
  return {
    id: overrides.id ?? 'clip-1',
    jobId: overrides.jobId ?? 'job-1',
    startTime: 0,
    endTime: 30,
    topic: 'topic',
    score: 80,
    scoreBreakdown: { hook: 8, retention: 8, emotion: 8, clarity: 8, shareability: 8, cta: 8 },
    hookOptions: ['hook'],
    chosenHook: 'hook',
    status: 'done',
    ...overrides,
  };
}

function job(id: string, clips: Clip[]): Job {
  return {
    id,
    originalFilename: 'video.mp4',
    sourceFile: 'video.mp4',
    status: 'done',
    createdAt: new Date().toISOString(),
    clips,
  };
}

test('getScheduledClips: only returns done clips that have a scheduledFor, sorted earliest first', () => {
  const jobs = [
    job('job-1', [
      clip({ id: 'a', scheduledFor: '2026-09-05' }),
      clip({ id: 'b', scheduledFor: undefined }),
      clip({ id: 'c', status: 'rendering', scheduledFor: '2026-09-01' }),
      clip({ id: 'd', scheduledFor: '2026-09-02' }),
    ]),
  ];

  const entries = getScheduledClips(jobs);
  assert.deepEqual(
    entries.map((e) => e.clip.id),
    ['d', 'a']
  );
});

test('getUnscheduledDoneClips: only returns done clips without a scheduledFor', () => {
  const jobs = [
    job('job-1', [
      clip({ id: 'a', scheduledFor: '2026-09-05' }),
      clip({ id: 'b', scheduledFor: undefined }),
      clip({ id: 'c', status: 'pending', scheduledFor: undefined }),
    ]),
  ];

  const entries = getUnscheduledDoneClips(jobs);
  assert.deepEqual(
    entries.map((e) => e.clip.id),
    ['b']
  );
});

test('suggestScheduleDates: spaces dates intervalDays apart starting after "from"', () => {
  const from = new Date('2026-08-31T00:00:00Z');
  const dates = suggestScheduleDates(3, 2, from);
  assert.deepEqual(dates, ['2026-09-02', '2026-09-04', '2026-09-06']);
});

test('suggestScheduleDates: returns an empty array for zero candidates', () => {
  assert.deepEqual(suggestScheduleDates(0, 2, new Date()), []);
});
