import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCaptionCues, buildAssFile } from './ass.js';
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

test('buildAssFile: burns a CTA line into the last ~2.5s and clips regular captions before it', () => {
  const cues = [{ start: 5, end: 11, text: 'RUNS RIGHT UP TO THE END' }];

  const ass = buildAssFile('hook text', cues, 12, 'save this video');

  assert.match(ass, /SAVE THIS VIDEO/);
  // The CTA dialogue line should start at duration - 2.5 = 9.5s.
  assert.match(ass, /Dialogue: 0,0:00:09\.50,0:00:12\.00,Caption,,0,0,0,,SAVE THIS VIDEO/);
  // The regular caption cue (5-11s) must not extend past where the CTA window starts (9.5s).
  assert.doesNotMatch(ass, /0:00:1[01]\.\d\d,Caption,,0,0,0,,RUNS RIGHT UP TO THE END/);
});

test('buildAssFile: omits the CTA line entirely when no ctaText is given', () => {
  const ass = buildAssFile('hook text', [], 12);
  assert.equal((ass.match(/Dialogue:/g) ?? []).length, 1); // just the hook line
});
