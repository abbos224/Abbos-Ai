import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ideaJobItemCount, type IdeaJob } from './ideaStore.js';

function baseJob(overrides: Partial<IdeaJob>): IdeaJob {
  return {
    id: 'job-1',
    topic: 'topic',
    mode: 'topics',
    status: 'done',
    createdAt: new Date().toISOString(),
    ideas: [],
    scripts: [],
    contentPlan: [],
    shotList: null,
    targeting: null,
    ...overrides,
  };
}

test('ideaJobItemCount: counts real ideas for "topics" mode', () => {
  const job = baseJob({
    mode: 'topics',
    ideas: [
      { id: 'a', hook: 'h', script: 's', cta: 'c' },
      { id: 'b', hook: 'h', script: 's', cta: 'c' },
    ],
  });
  assert.equal(ideaJobItemCount(job), 2);
});

test('ideaJobItemCount: counts real scripts for "script" mode', () => {
  const job = baseJob({
    mode: 'script',
    scripts: [{ id: 'a', title: 't', angle: 'a', sections: [], cta: 'c', estimatedDurationSec: 60 }],
  });
  assert.equal(ideaJobItemCount(job), 1);
});

test('ideaJobItemCount: counts real days for "contentPlan" mode', () => {
  const job = baseJob({
    mode: 'contentPlan',
    contentPlan: Array.from({ length: 7 }, (_, i) => ({
      id: String(i),
      day: i + 1,
      format: 'Reel',
      title: 't',
      captionShort: 'c',
      hashtags: [],
    })),
  });
  assert.equal(ideaJobItemCount(job), 7);
});

test('ideaJobItemCount: counts real shots for "shotList" mode, 0 when still generating (shotList null)', () => {
  const generating = baseJob({ mode: 'shotList', shotList: null });
  assert.equal(ideaJobItemCount(generating), 0);

  const done = baseJob({
    mode: 'shotList',
    shotList: {
      items: [
        { id: 'a', shotNumber: 1, shotType: 'Wide', description: 'd', durationEstimateSec: 3 },
        { id: 'b', shotNumber: 2, shotType: 'Close-up', description: 'd', durationEstimateSec: 3 },
      ],
      overallTips: ['tip'],
    },
  });
  assert.equal(ideaJobItemCount(done), 2);
});

test('ideaJobItemCount: counts audience segments + ad copy variants combined for "targeting" mode', () => {
  const job = baseJob({
    mode: 'targeting',
    targeting: {
      audienceSegments: [
        { id: 'a', name: 'n', ageRange: '25-34', interests: [], rationale: 'r' },
        { id: 'b', name: 'n', ageRange: '25-34', interests: [], rationale: 'r' },
      ],
      adCopyVariants: [{ id: 'c', headline: 'h', primaryText: 'p', cta: 'c' }],
    },
  });
  assert.equal(ideaJobItemCount(job), 3);
});
