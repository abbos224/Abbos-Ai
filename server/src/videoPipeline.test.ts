import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTimelineSegments, buildZoomKeyframes, findFillerWordRanges, isFillerWord } from './videoPipeline.js';
import type { Word } from './transcription.js';

function word(text: string, start: number, end: number): Word {
  return { text, start, end };
}

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

test('buildZoomKeyframes: alternates 1.0 / 1.08 in 5s steps, clipping the last step to duration', () => {
  const keyframes = buildZoomKeyframes(12);

  assert.deepEqual(keyframes, [
    { start: 0, end: 5, scale: 1.0 },
    { start: 5, end: 10, scale: 1.08 },
    { start: 10, end: 12, scale: 1.0 },
  ]);
});

test('buildZoomKeyframes: a clip shorter than one step returns a single un-zoomed segment', () => {
  assert.deepEqual(buildZoomKeyframes(3), [{ start: 0, end: 3, scale: 1.0 }]);
});

test('buildZoomKeyframes: an exact multiple of the step duration ends cleanly with no zero-length step', () => {
  const keyframes = buildZoomKeyframes(10);

  assert.deepEqual(keyframes, [
    { start: 0, end: 5, scale: 1.0 },
    { start: 5, end: 10, scale: 1.08 },
  ]);
});

test('buildZoomKeyframes: returns an empty array for a zero or negative duration', () => {
  assert.deepEqual(buildZoomKeyframes(0), []);
  assert.deepEqual(buildZoomKeyframes(-5), []);
});

test('isFillerWord: matches known disfluency interjections case-insensitively and with punctuation', () => {
  assert.equal(isFillerWord('um'), true);
  assert.equal(isFillerWord('Um,'), true);
  assert.equal(isFillerWord('UH.'), true);
  assert.equal(isFillerWord('hmm'), true);
});

test('isFillerWord: does not flag ordinary words, including ones that merely start similarly', () => {
  assert.equal(isFillerWord('like'), false);
  assert.equal(isFillerWord('you'), false);
  assert.equal(isFillerWord('humble'), false);
});

test('findFillerWordRanges: pulls out only the filler words\' time ranges, in order', () => {
  const words = [word('So', 0, 0.3), word('um', 0.3, 0.6), word('I', 0.6, 0.8), word('think', 0.8, 1.2)];
  assert.deepEqual(findFillerWordRanges(words), [{ start: 0.3, end: 0.6 }]);
});

test('findFillerWordRanges: returns an empty array when there are no filler words', () => {
  assert.deepEqual(findFillerWordRanges([word('hello', 0, 0.5), word('world', 0.5, 1)]), []);
});
