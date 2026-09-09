import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIsoDuration } from './youtube.js';

test('parseIsoDuration: parses hours/minutes/seconds combinations', () => {
  assert.equal(parseIsoDuration('PT1M30S'), 90);
  assert.equal(parseIsoDuration('PT45S'), 45);
  assert.equal(parseIsoDuration('PT2H5M'), 7500);
  assert.equal(parseIsoDuration('PT1H'), 3600);
});

test('parseIsoDuration: returns 0 for an unparseable string instead of throwing', () => {
  assert.equal(parseIsoDuration('garbage'), 0);
  assert.equal(parseIsoDuration(''), 0);
});
