import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCaptionCues, buildAssFile, CAPTION_STYLES } from './ass.js';
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
  assert.equal(cues[0].text, 'this is a test');
  assert.equal(cues[0].start, 0);
  assert.equal(cues[0].end, 0.8);
  assert.equal(cues[1].text, 'sentence');
});

test('buildCaptionCues: flushes early on sentence-ending punctuation', () => {
  const words = [word('hi.', 0, 0.3), word('there', 0.3, 0.6)];

  const cues = buildCaptionCues(words);

  assert.equal(cues.length, 2);
  assert.equal(cues[0].text, 'hi.');
  assert.equal(cues[1].text, 'there');
});

test('buildCaptionCues: flushes when a cue would exceed ~2.2s even with few words', () => {
  const words = [word('long', 0, 1.5), word('pause', 1.5, 2.5)];

  const cues = buildCaptionCues(words);

  assert.equal(cues.length, 1);
  assert.equal(cues[0].text, 'long pause');
  assert.equal(cues[0].end, 2.5);
});

test('buildCaptionCues: returns an empty array for no words', () => {
  assert.deepEqual(buildCaptionCues([]), []);
});

test('buildAssFile: every caption style preset produces a valid, uppercase-consistent .ass file', () => {
  const cues = [{ start: 3, end: 4.5, text: 'check this before you sign' }];

  for (const style of CAPTION_STYLES) {
    const ass = buildAssFile('nobody tells you this', cues, undefined, style);

    assert.match(ass, /^\[Script Info\]/);
    assert.match(ass, /\[V4\+ Styles\]/);
    assert.match(ass, /\[Events\]/);
    assert.match(ass, /Style: Hook,/);
    assert.match(ass, /Style: Caption,/);
    // 'bold', 'kinetic' and 'gaming' upper-case their text; the rest keep natural case.
    if (style === 'bold' || style === 'kinetic' || style === 'gaming') {
      assert.match(ass, /NOBODY TELLS YOU THIS/);
    } else {
      assert.match(ass, /nobody tells you this/);
    }
  }
});

test('buildAssFile: an explicit accent color overrides the preset default', () => {
  const ass = buildAssFile('hook', [], '#123ABC', 'bold');
  // #123ABC -> ASS BGR with 00 alpha prefix -> &H00BC3A12
  assert.match(ass, /&H00BC3A12/i);
});
