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
