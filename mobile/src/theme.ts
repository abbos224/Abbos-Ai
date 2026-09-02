// Shared design tokens. Dark/purple direction, matching the ReelAI mockup set the app is being
// rebranded to — near-black surfaces with a violet accent, card elevation via subtle borders
// rather than shadows (shadows barely read on a dark background). Used across all screens so the
// palette stays consistent in one place.
export const colors = {
  background: '#0B0B12',
  surface: '#171721',
  border: '#26263A',
  textPrimary: '#F5F5F7',
  textSecondary: '#A8A8B8',
  textMuted: '#6E6E80',
  accent: '#8B5CF6',
  accentSurface: '#241B3D',
  // A second accent reserved for AI-generation surfaces (Idea Generator, "Generate"-type
  // actions) — `accent` (violet) stays the primary brand color for navigation/general chrome.
  // Matches the two-accent split in the reference mockups (purple Projects screen, cyan Idea
  // Generator screens).
  accentAI: '#22D3EE',
  // Text/icon color for content sitting directly on a solid `accent` background (buttons, active
  // chips) — kept as its own token because `surface` no longer means "white" now that cards are
  // dark, but content on the accent color still needs to read clearly against it.
  onAccent: '#FFFFFF',
  danger: '#F87171',
  success: '#34D399',
};

export const radius = { sm: 8, md: 10, lg: 14 };

export const spacing = { xs: 6, sm: 10, md: 16, lg: 24, xl: 32 };

export const type = {
  title: { fontSize: 22, fontWeight: '600' as const, color: colors.textPrimary },
  body: { fontSize: 14, color: colors.textSecondary },
};

// Gradient stops for GradientButton / gradient-bordered cards. `ai` for AI-generation actions
// (cyan -> blue), `brand` for general brand chrome (violet -> deep purple).
export const gradients = {
  ai: [colors.accentAI, '#3B82F6'] as const,
  brand: [colors.accent, '#6D28D9'] as const,
};

/** A soft neon-glow shadow behind an icon badge or button, colored to match its content. RN
 * shadows only render on iOS by default; `elevation` gives Android a comparable (though flatter)
 * lift — there's no true glow on Android without extra native work, which isn't worth it here. */
export function glowShadow(color: string) {
  return {
    shadowColor: color,
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  } as const;
}

/** Bands a 0-100 content score (overall or a single breakdown dimension) into a color, so a
 * number reads as good/mid/weak at a glance instead of always looking the same regardless of
 * value. Used by ResultsScreen's score pill and PreviewScreen's score card. */
export function getScoreColor(score: number): string {
  if (score >= 75) return colors.success;
  if (score >= 50) return colors.accent;
  return colors.danger;
}
