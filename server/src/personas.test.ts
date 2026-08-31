import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PERSONA_NAMES, getPersonaVoiceGuidance, isPersonaName, listPersonas } from './personas.js';

test('listPersonas: returns one entry per persona with a label and description', () => {
  const personas = listPersonas();
  assert.equal(personas.length, PERSONA_NAMES.length);
  for (const p of personas) {
    assert.ok(p.label.length > 0);
    assert.ok(p.description.length > 0);
  }
});

test('getPersonaVoiceGuidance: every persona has non-empty, distinct voice guidance', () => {
  const guidance = PERSONA_NAMES.map(getPersonaVoiceGuidance);
  for (const g of guidance) {
    assert.ok(g.length > 20);
  }
  assert.equal(new Set(guidance).size, guidance.length);
});

test('isPersonaName: accepts known persona names and rejects anything else', () => {
  for (const name of PERSONA_NAMES) {
    assert.equal(isPersonaName(name), true);
  }
  assert.equal(isPersonaName('madeUpPersona'), false);
  assert.equal(isPersonaName(''), false);
});
