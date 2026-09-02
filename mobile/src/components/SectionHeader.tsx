import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing } from '../theme';

type Props = {
  eyebrow: string;
  title: string;
  /** A substring of `title` to render in `highlightColor` instead of `textPrimary` — a plain
   * two-color text split approximating the mockups' gradient-text headlines without pulling in a
   * masked-view dependency. Must appear verbatim in `title`. */
  highlight?: string;
  highlightColor?: string;
  subtitle?: string;
};

export default function SectionHeader({ eyebrow, title, highlight, highlightColor = colors.accent, subtitle }: Props) {
  const parts = highlight && title.includes(highlight) ? title.split(highlight) : null;

  return (
    <View style={styles.container}>
      <Text style={styles.eyebrow}>{eyebrow}</Text>
      {parts ? (
        <Text style={styles.title}>
          {parts[0]}
          <Text style={{ color: highlightColor }}>{highlight}</Text>
          {parts.slice(1).join(highlight as string)}
        </Text>
      ) : (
        <Text style={styles.title}>{title}</Text>
      )}
      {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: spacing.xl },
  eyebrow: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  title: { color: colors.textPrimary, fontSize: 24, fontWeight: '700' },
  subtitle: { color: colors.textSecondary, fontSize: 13, marginTop: spacing.xs, lineHeight: 19 },
});
