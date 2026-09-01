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
