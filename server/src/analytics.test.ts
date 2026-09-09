import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractYoutubeVideoId, getPublishedClips, computeChannelInsights } from './analytics.js';
import type { Clip, Job } from './store.js';
import type { ChannelVideo } from './youtube.js';

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

function video(overrides: Partial<ChannelVideo>): ChannelVideo {
  return {
    videoId: overrides.videoId ?? 'v1',
    title: overrides.title ?? 'Untitled',
    thumbnailUrl: '',
    publishedAt: '2026-01-01T00:00:00Z',
    durationSec: overrides.durationSec ?? 90,
    viewCount: overrides.viewCount ?? 0,
    likeCount: overrides.likeCount ?? 0,
    commentCount: overrides.commentCount ?? 0,
    url: `https://www.youtube.com/watch?v=${overrides.videoId ?? 'v1'}`,
    ...overrides,
  };
}

test('computeChannelInsights: returns nothing for an empty channel', () => {
  assert.deepEqual(computeChannelInsights([]), []);
});

test('computeChannelInsights: names the real top-performing video by its real view count', () => {
  const videos = [
    video({ videoId: 'a', title: 'Low', viewCount: 100 }),
    video({ videoId: 'b', title: 'High', viewCount: 1000 }),
    video({ videoId: 'c', title: 'Mid', viewCount: 300 }),
  ];
  const insights = computeChannelInsights(videos);
  const top = insights.find((i) => i.label === 'Top performer');
  assert.ok(top);
  assert.match(top!.detail, /"High" leads with 1,000 views/);
  // average is (100+1000+300)/3 = 466.67, 1000/466.67 = 2.14x -> should be called out
  assert.match(top!.detail, /2\.1x your channel average/);
});

test('computeChannelInsights: skips the top-performer callout entirely when every video has 0 views', () => {
  const videos = [video({ videoId: 'a', viewCount: 0 }), video({ videoId: 'b', viewCount: 0 })];
  const insights = computeChannelInsights(videos);
  assert.equal(insights.find((i) => i.label === 'Top performer'), undefined);
});

test('computeChannelInsights: computes a real engagement rate from actual like/comment/view counts', () => {
  const videos = [
    video({ videoId: 'a', viewCount: 1000, likeCount: 100, commentCount: 0 }), // 10%
    video({ videoId: 'b', viewCount: 1000, likeCount: 0, commentCount: 50 }), // 5%
  ];
  const insights = computeChannelInsights(videos);
  const engagement = insights.find((i) => i.label === 'Engagement');
  assert.ok(engagement);
  // average of 10% and 5% = 7.5%
  assert.match(engagement!.detail, /7\.5%/);
});

test('computeChannelInsights: compares shorts vs. longform only when there are at least 2 of each', () => {
  const onlyOneShort = [
    video({ videoId: 'a', durationSec: 30, viewCount: 500 }),
    video({ videoId: 'b', durationSec: 120, viewCount: 100 }),
    video({ videoId: 'c', durationSec: 180, viewCount: 100 }),
  ];
  assert.equal(computeChannelInsights(onlyOneShort).find((i) => i.label === 'Format'), undefined);

  const realMix = [
    video({ videoId: 'a', durationSec: 30, viewCount: 1000 }),
    video({ videoId: 'b', durationSec: 45, viewCount: 800 }),
    video({ videoId: 'c', durationSec: 300, viewCount: 100 }),
    video({ videoId: 'd', durationSec: 400, viewCount: 100 }),
  ];
  const format = computeChannelInsights(realMix).find((i) => i.label === 'Format');
  assert.ok(format);
  assert.match(format!.detail, /Videos under a minute average more views/);
});
