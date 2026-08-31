import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTimelineSegments } from './videoPipeline.js';

test('buildTimelineSegments: interleaves a single B-roll window between two main segments', () => {
  const segments = buildTimelineSegments([{ start: 4, end: 6.5, brollPath: 'a.mp4' }], 12);

  assert.deepEqual(segments, [
    { type: 'main', start: 0, end: 4 },
    { type: 'broll', start: 4, end: 6.5, brollPath: 'a.mp4' },
    { type: 'main', start: 6.5, end: 12 },
  ]);
});

test('buildTimelineSegments: handles a B-roll window starting at t=0 (no leading main segment)', () => {
  const segments = buildTimelineSegments([{ start: 0, end: 2, brollPath: 'a.mp4' }], 10);

  assert.equal(segments[0].type, 'broll');
  assert.equal(segments.length, 2);
});

test('buildTimelineSegments: handles a B-roll window ending at the clip end (no trailing main segment)', () => {
  const segments = buildTimelineSegments([{ start: 8, end: 10, brollPath: 'a.mp4' }], 10);

  assert.equal(segments.length, 2);
  assert.equal(segments[1].type, 'broll');
});

test('buildTimelineSegments: drops a later B-roll window that overlaps an earlier one', () => {
  const segments = buildTimelineSegments(
    [
      { start: 2, end: 5, brollPath: 'a.mp4' },
      { start: 4, end: 7, brollPath: 'b.mp4' }, // overlaps a.mp4's window — should be dropped
    ],
    10,
  );

  const brollSegments = segments.filter((s) => s.type === 'broll');
  assert.equal(brollSegments.length, 1);
  assert.equal(brollSegments[0].brollPath, 'a.mp4');
});

test('buildTimelineSegments: sorts out-of-order moments before interleaving', () => {
  const segments = buildTimelineSegments(
    [
      { start: 7, end: 8, brollPath: 'second.mp4' },
      { start: 1, end: 2, brollPath: 'first.mp4' },
    ],
    10,
  );

  const brollOrder = segments.filter((s) => s.type === 'broll').map((s) => s.brollPath);
  assert.deepEqual(brollOrder, ['first.mp4', 'second.mp4']);
});

test('buildTimelineSegments: returns one full-length main segment when there are no B-roll moments', () => {
  assert.deepEqual(buildTimelineSegments([], 10), [{ type: 'main', start: 0, end: 10 }]);
});
