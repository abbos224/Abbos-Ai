import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractYoutubeVideoId, getPublishedClips } from './analytics.js';
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
    cta: 'cta',
    coverOptions: ['cover'],
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

test('extractYoutubeVideoId: pulls the v= param out of a watch URL', () => {
  assert.equal(extractYoutubeVideoId('https://www.youtube.com/watch?v=abc123'), 'abc123');
  assert.equal(extractYoutubeVideoId('https://www.youtube.com/watch?list=x&v=abc123'), 'abc123');
});

test('extractYoutubeVideoId: returns null for a URL with no v= param or invalid URL', () => {
  assert.equal(extractYoutubeVideoId('https://www.youtube.com/watch'), null);
  assert.equal(extractYoutubeVideoId('not a url'), null);
});

test('getPublishedClips: only returns clips with a publishedYoutubeUrl, video id extracted', () => {
  const jobs = [
    job('job-1', [
      clip({ id: 'a', publishedYoutubeUrl: 'https://www.youtube.com/watch?v=vid-a' }),
      clip({ id: 'b' }), // never published
      clip({ id: 'c', publishedYoutubeUrl: 'https://www.youtube.com/watch?v=vid-c' }),
    ]),
  ];

  const entries = getPublishedClips(jobs);
  assert.deepEqual(
    entries.map((e) => [e.clip.id, e.videoId]),
    [
      ['a', 'vid-a'],
      ['c', 'vid-c'],
    ]
  );
});

test('getPublishedClips: returns an empty array when nothing has been published', () => {
  const jobs = [job('job-1', [clip({ id: 'a' })])];
  assert.deepEqual(getPublishedClips(jobs), []);
});
