import { getPool } from './db.js';

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

/** The account's currently-selected persona, or undefined for the neutral default voice. */
export async function getActivePersona(userId: string): Promise<PersonaName | undefined> {
  const result = await getPool().query<{ active_persona: string | null }>(
    'SELECT active_persona FROM persona_settings WHERE user_id = $1',
    [userId],
  );
  const value = result.rows[0]?.active_persona;
  return value && isPersonaName(value) ? value : undefined;
}

export async function setActivePersona(userId: string, name: PersonaName | null): Promise<PersonaName | undefined> {
  await getPool().query(
    `INSERT INTO persona_settings (user_id, active_persona)
     VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET active_persona = EXCLUDED.active_persona`,
    [userId, name],
  );
  return name ?? undefined;
}
