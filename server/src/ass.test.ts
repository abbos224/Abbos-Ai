import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCaptionCues } from './ass.js';
import type { Word } from './transcription.js';

function word(text: string, start: number, end: number): Word {
  return { text, start, end };
}

test('buildCaptionCues: groups words up to 4 per cue', () => {
  const words = [
    word('this', 0, 0.2),
    word('is', 0.2, 0.4),
    word('a', 0.4, 0.5),
    word('test', 0.5, 0.8),
    word('sentence', 0.8, 1.2),
  ];

  const cues = buildCaptionCues(words);

  assert.equal(cues.length, 2);
  assert.equal(cues[0].text, 'THIS IS A TEST');
  assert.equal(cues[0].start, 0);
  assert.equal(cues[0].end, 0.8);
  assert.equal(cues[1].text, 'SENTENCE');
});

test('buildCaptionCues: flushes early on sentence-ending punctuation', () => {
  const words = [word('hi.', 0, 0.3), word('there', 0.3, 0.6)];

  const cues = buildCaptionCues(words);

  assert.equal(cues.length, 2);
  assert.equal(cues[0].text, 'HI.');
  assert.equal(cues[1].text, 'THERE');
});

test('buildCaptionCues: flushes when a cue would exceed ~2.2s even with few words', () => {
  const words = [word('long', 0, 1.5), word('pause', 1.5, 2.5)];

  const cues = buildCaptionCues(words);

  assert.equal(cues.length, 1);
  assert.equal(cues[0].text, 'LONG PAUSE');
  assert.equal(cues[0].end, 2.5);
});

test('buildCaptionCues: returns an empty array for no words', () => {
  assert.deepEqual(buildCaptionCues([]), []);
});
