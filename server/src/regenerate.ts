import { getAnthropicClient } from './anthropicClient.js';
import { getPersonaVoiceGuidance, type PersonaName } from './personas.js';
import { ANTI_CLICHE_GUARDRAIL } from './promptGuardrails.js';
import type { RegenerateModifier, SocialCaption } from './store.js';

type ModifierPreset = { label: string; instruction: string };

const MODIFIERS: Record<RegenerateModifier, ModifierPreset> = {
  moreViral: {
    label: 'More Viral',
    instruction:
      'Punchier, more provocative, higher-urgency — the kind of hook and CTA that stops a scroll. ' +
      'Lean into curiosity gaps, bold claims, and a strong shareability angle.',
  },
  moreProfessional: {
    label: 'More Professional',
    instruction:
      'Polished, credible, understated — the voice of an expert, not a hype account. Favor clarity ' +
      'and authority over shock value. No excessive exclamation points or clickbait phrasing.',
  },
  moreEmotional: {
    label: 'More Emotional',
    instruction:
      'Lean harder into the human, emotional core of the moment — empathy, stakes, vulnerability, or ' +
      'a personal connection. Make the viewer feel something before they think.',
  },
  moreLuxury: {
    label: 'More Luxury',
    instruction:
      'Polished and aspirational — understated confidence, not hype. Think exclusive access, refined ' +
      'taste, elevated outcomes. Never sound like a bargain-bin ad.',
  },
};

export const REGENERATE_MODIFIERS: RegenerateModifier[] = Object.keys(MODIFIERS) as RegenerateModifier[];

export function isRegenerateModifier(value: string): value is RegenerateModifier {
  return (REGENERATE_MODIFIERS as string[]).includes(value);
}

export function getModifierLabel(modifier: RegenerateModifier): string {
  return MODIFIERS[modifier].label;
}

export type RegeneratedCreative = {
  hookOptions: string[];
  cta: string;
  coverOptions: string[];
  socialCaption: SocialCaption;
};

/**
 * Re-writes a clip's hook/CTA/cover/social-caption set with a specific tone modifier applied,
 * given the clip's actual spoken content (its caption cues) as grounding — the spirit of the
 * spec's "Regenerate: More viral / More professional / More emotional / More luxury" feature.
 * Reuses the clip's existing edit (crop, B-roll, timing) rather than re-analyzing the source video.
 * `persona`, when the account has one active, layers the account's own Voice on top of the
 * modifier's tone shift — previously this function ignored the active persona entirely, so
 * regenerating a clip silently reverted to Claude's neutral voice even with a persona selected.
 */
export async function regenerateCreative(
  topic: string,
  spokenText: string,
  currentHook: string,
  currentCta: string,
  modifier: RegenerateModifier,
  persona?: PersonaName,
): Promise<RegeneratedCreative> {
  const personaClause = persona ? ` Overall voice/persona: ${getPersonaVoiceGuidance(persona)}` : '';

  const message = await getAnthropicClient().messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 2048,
    system:
      'You rewrite the hook, CTA, cover titles, and social caption for an already-edited short-form ' +
      'video clip, given its topic and actual spoken content. You are NOT re-editing the video — only ' +
      `rewriting the on-screen/post text in a new voice. Tone shift to apply: ${MODIFIERS[modifier].instruction}` +
      `${personaClause} ${ANTI_CLICHE_GUARDRAIL} ` +
      'Respond with ONLY valid JSON (no markdown fences, no commentary), matching this shape exactly: ' +
      '{ "hook_options": [string, string, string], "cta": string, "cover_options": [string, string, string], ' +
      '"social_caption": { "short": string, "medium": string, "long": string, "hashtags": [string, ...], ' +
      '"keywords": [string, ...] } }. hook_options are three alternative opening lines (under 12 words). ' +
      'cta is under 8 words and matched to the content — e.g. "Save this for later", "Follow for more", ' +
      '"DM us to learn more", "Book a consultation", "Comment your thoughts" — pick whichever fits this ' +
      "tone and topic, don't default to the same one every time. cover_options are three short " +
      'title-case cover titles (under 6 words, no ending punctuation). social_caption follows the same ' +
      'short/medium/long/hashtags/keywords shape used elsewhere in this app.',
    messages: [
      {
        role: 'user',
        content: JSON.stringify({ topic, spoken_text: spokenText, current_hook: currentHook, current_cta: currentCta }),
      },
    ],
  });

  const textBlock = message.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('Claude regenerate response contained no text block');
  }

  const jsonText = textBlock.text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();

  let parsed: {
    hook_options: string[];
    cta: string;
    cover_options: string[];
    social_caption: SocialCaption;
  };
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error(`Failed to parse regenerate JSON: ${jsonText.slice(0, 500)}`);
  }

  return {
    hookOptions: parsed.hook_options,
    cta: parsed.cta,
    coverOptions: parsed.cover_options,
    socialCaption: parsed.social_caption,
  };
}
