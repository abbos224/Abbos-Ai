// Shared design tokens. Deliberately restrained/"business" — muted neutrals and one quiet
// accent color, not the neon/gradient look of consumer short-form editors. Used across all
// screens so the palette stays consistent in one place.
export const colors = {
  background: '#F6F6F4',
  surface: '#FFFFFF',
  border: '#E3E2DD',
  textPrimary: '#1B1B18',
  textSecondary: '#6B6A64',
  textMuted: '#9B9A93',
  accent: '#1F3A5F',
  accentSurface: '#EAEFF4',
  danger: '#A6362C',
  success: '#3D6B57',
};

export const radius = { sm: 8, md: 10, lg: 14 };

export const spacing = { xs: 6, sm: 10, md: 16, lg: 24, xl: 32 };

export const type = {
  title: { fontSize: 22, fontWeight: '600' as const, color: colors.textPrimary },
  body: { fontSize: 14, color: colors.textSecondary },
};
