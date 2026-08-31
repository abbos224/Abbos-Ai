import fs from 'node:fs';
import path from 'node:path';
import { env } from './env.js';

export type PersonaName =
  | 'trustedAdvisor'
  | 'boldContrarian'
  | 'friendlyNeighbor'
  | 'luxuryConcierge'
  | 'energeticCoach';

type PersonaPreset = {
  label: string;
  description: string;
  /** Injected into the clip-analysis system prompt to steer hook/CTA/cover wording. */
  voiceGuidance: string;
};

const PERSONAS: Record<PersonaName, PersonaPreset> = {
  trustedAdvisor: {
    label: 'Trusted Advisor',
    description: 'Calm, credible, and reassuring — leans on expertise.',
    voiceGuidance:
      'Write the hooks, CTA, and cover titles in the voice of a trusted, experienced advisor: calm, ' +
      'credible, reassuring. Favor phrasing that signals expertise and safety (e.g. "Here\'s what most ' +
      'people miss") over hype. The CTA should invite a low-pressure next step, like a consultation or ' +
      'a saved resource.',
  },
  boldContrarian: {
    label: 'Bold Contrarian',
    description: "Confident and myth-busting — challenges the audience's assumptions.",
    voiceGuidance:
      'Write the hooks, CTA, and cover titles in a bold, myth-busting voice that directly challenges a ' +
      'common assumption or contradicts what "everyone thinks." Be confident and a little provocative, ' +
      'but never dishonest about the content. The CTA should push for engagement (comment, argue back, share).',
  },
  friendlyNeighbor: {
    label: 'Friendly Neighbor',
    description: 'Warm and conversational — like advice from a friend.',
    voiceGuidance:
      'Write the hooks, CTA, and cover titles in a warm, conversational voice, like a knowledgeable ' +
      'friend giving casual advice over coffee. Avoid corporate or salesy language. The CTA should feel ' +
      'like a friendly nudge, not a pitch.',
  },
  luxuryConcierge: {
    label: 'Luxury Concierge',
    description: 'Polished and aspirational — for high-end positioning.',
    voiceGuidance:
      'Write the hooks, CTA, and cover titles in a polished, aspirational voice suited to a premium ' +
      'audience: understated confidence, not hype — exclusive access, refined taste, elevated outcomes. ' +
      'The CTA should invite an exclusive next step, like a private consultation or requesting access.',
  },
  energeticCoach: {
    label: 'Energetic Coach',
    description: 'High-energy and motivational — pushes to action.',
    voiceGuidance:
      'Write the hooks, CTA, and cover titles in a high-energy, motivational coaching voice: direct, ' +
      'urgent, encouraging. Push the viewer to take action now. The CTA should be a short, punchy ' +
      'command ("Do this today", "Start now").',
  },
};

export const PERSONA_NAMES: PersonaName[] = Object.keys(PERSONAS) as PersonaName[];

export function isPersonaName(value: string): value is PersonaName {
  return (PERSONA_NAMES as string[]).includes(value);
}

export function listPersonas(): Array<{ name: PersonaName; label: string; description: string }> {
  return PERSONA_NAMES.map((name) => ({
    name,
    label: PERSONAS[name].label,
    description: PERSONAS[name].description,
  }));
}

/** Pure lookup — the bit of this module worth unit-testing without touching disk. */
export function getPersonaVoiceGuidance(name: PersonaName): string {
  return PERSONAS[name].voiceGuidance;
}

type PersonaSettings = { activePersona?: PersonaName };

const settingsPath = path.join(env.storageDir, 'personaSettings.json');

function readSettings(): PersonaSettings {
  if (!fs.existsSync(settingsPath)) return {};
  return JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
}

/** The account's currently-selected persona, or undefined for the neutral default voice. */
export function getActivePersona(): PersonaName | undefined {
  return readSettings().activePersona;
}

export function setActivePersona(name: PersonaName | null): PersonaName | undefined {
  const settings: PersonaSettings = name ? { activePersona: name } : {};
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  return settings.activePersona;
}
