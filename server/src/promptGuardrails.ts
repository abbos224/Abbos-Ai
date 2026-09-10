// Shared across every Claude-copy call in this app (analysis.ts, regenerate.ts, ideaGenerator.ts)
// — the single biggest failure mode of LLM marketing copy is reaching for the same handful of
// AI-sounding phrases regardless of topic or voice. Naming them explicitly measurably reduces how
// often they show up. Kept in its own file rather than one of the feature files above so none of
// them has to import from a sibling feature.
export const ANTI_CLICHE_GUARDRAIL =
  'Avoid generic AI-marketing-speak: "game changer", "game-changing", "unlock", "level up", ' +
  '"in today\'s world", "let\'s dive in", "unleash", empty superlatives, or opening with a ' +
  'rhetorical question just for the sake of it. Write like a specific creator talking about this ' +
  'specific topic, not a template that could apply to anything.';

const LANGUAGE_NAMES: Record<string, string> = { ru: 'Russian', uz: 'Uzbek (Latin script)', en: 'English' };

/**
 * A one-line system-prompt directive telling Claude which language to write every generated
 * string in — driven by the `X-App-Language` header the mobile app sends (its current UI
 * language). Empty string for English or an unknown/missing value, so existing behaviour is
 * unchanged when the header isn't present. Section labels, titles, scripts, captions — everything
 * user-facing — should come back in this language even when the topic itself is in another one.
 */
export function languageDirective(appLanguage: string | undefined): string {
  const name = appLanguage && LANGUAGE_NAMES[appLanguage];
  if (!name || appLanguage === 'en') return '';
  return `\n\nWrite EVERY piece of generated text — titles, section labels, scripts, hooks, CTAs, captions, hashtags-as-words, rationale, all of it — in ${name}, even if the topic below is written in another language. Keep proper nouns, brand names, and platform names (YouTube, Instagram, Reel, TikTok) as-is.`;
}
