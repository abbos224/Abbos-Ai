import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupIntoSpeakerTurns } from './speakerFraming.js';
import type { Word } from './transcription.js';

function word(text: string, start: number, end: number, speaker?: string): Word {
  return { text, start, end, speaker };
}

test('groupIntoSpeakerTurns: keeps two distinct, well-separated speaker turns', () => {
  const words = [
    word('hello', 0, 0.5, 'A'),
    word('there', 0.5, 1.0, 'A'),
    word('hi', 2.0, 2.5, 'B'),
    word('back', 2.5, 3.5, 'B'),
  ];

  const turns = groupIntoSpeakerTurns(words);

  assert.equal(turns.length, 2);
  assert.deepEqual(turns[0], { speaker: 'A', start: 0, end: 1.0 });
  assert.deepEqual(turns[1], { speaker: 'B', start: 2.0, end: 3.5 });
});

test('groupIntoSpeakerTurns: merges a short flicker into the surrounding turn', () => {
  // B briefly "speaks" for 0.2s in the middle of a long A turn — diarization noise.
  const words = [
    word('one', 0, 1.0, 'A'),
    word('two', 1.0, 2.0, 'A'),
    word('huh', 2.0, 2.2, 'B'),
    word('three', 2.2, 3.2, 'A'),
    word('four', 3.2, 4.2, 'A'),
  ];

  const turns = groupIntoSpeakerTurns(words, 1.0);

  assert.equal(turns.length, 1);
  assert.equal(turns[0].speaker, 'A');
  assert.equal(turns[0].start, 0);
  assert.equal(turns[0].end, 4.2);
});

test('groupIntoSpeakerTurns: absorbs a too-short leading turn into the next one', () => {
  const words = [
    word('uh', 0, 0.3, 'B'),
    word('so', 0.3, 1.5, 'A'),
    word('anyway', 1.5, 2.5, 'A'),
  ];

  const turns = groupIntoSpeakerTurns(words, 1.0);

  assert.equal(turns.length, 1);
  assert.equal(turns[0].speaker, 'A');
  assert.equal(turns[0].start, 0);
  assert.equal(turns[0].end, 2.5);
});

test('groupIntoSpeakerTurns: returns an empty array when no words have a speaker label', () => {
  const words = [word('solo', 0, 1.0), word('narration', 1.0, 2.0)];

  assert.deepEqual(groupIntoSpeakerTurns(words), []);
});
