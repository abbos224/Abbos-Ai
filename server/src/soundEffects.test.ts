import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSoundEffectCues } from './soundEffects.js';

const zoomKeyframes = [
  { start: 0, end: 5, scale: 1.0 },
  { start: 5, end: 10, scale: 1.08 },
  { start: 10, end: 12, scale: 1.0 },
];

test('buildSoundEffectCues: "professional" style produces no cues at all', () => {
  const cues = buildSoundEffectCues([{ start: 6, text: 'this costs $2,000,000' }], zoomKeyframes, 'professional');
  assert.deepEqual(cues, []);
});

test('buildSoundEffectCues: "minimal" style only whooshes at zoom-scale changes, ignoring caption content', () => {
  const cues = buildSoundEffectCues([{ start: 6, text: 'WARNING: this is a mistake' }], zoomKeyframes, 'minimal');
  assert.deepEqual(cues, [
    { time: 5, effect: 'whoosh' },
    { time: 10, effect: 'whoosh' },
  ]);
});

test('buildSoundEffectCues: "dynamic" style adds a ding for a cue mentioning a price', () => {
  const cues = buildSoundEffectCues([{ start: 6, text: 'this costs $2,000,000' }], zoomKeyframes, 'dynamic');
  assert.deepEqual(cues, [
    { time: 5, effect: 'whoosh' },
    { time: 6, effect: 'ding' },
    { time: 10, effect: 'whoosh' },
  ]);
});

test('buildSoundEffectCues: "dynamic" style adds an alert for a cue with a warning word, not a ding', () => {
  const cues = buildSoundEffectCues([{ start: 6, text: "don't buy this yet" }], zoomKeyframes, 'dynamic');
  const cueEffects = cues.filter((c) => c.time === 6);
  assert.deepEqual(cueEffects, [{ time: 6, effect: 'alert' }]);
});

test('buildSoundEffectCues: a cue matching neither pattern gets no effect in "dynamic" style', () => {
  const cues = buildSoundEffectCues([{ start: 6, text: 'just a normal sentence' }], zoomKeyframes, 'dynamic');
  assert.equal(cues.some((c) => c.time === 6), false);
});

test('buildSoundEffectCues: results are sorted by time', () => {
  const cues = buildSoundEffectCues(
    [
      { start: 11, text: '50% off today' },
      { start: 1, text: 'never do this' },
    ],
    zoomKeyframes,
    'dynamic',
  );
  const times = cues.map((c) => c.time);
  assert.deepEqual(times, [...times].sort((a, b) => a - b));
});
