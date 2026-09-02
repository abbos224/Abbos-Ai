import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import IconBadge from './IconBadge';
import GradientButton from './GradientButton';
import { colors, gradients, spacing } from '../theme';

type Props = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
  ctaLabel?: string;
  onPressCta?: () => void;
};

/** Icon badge + title + subtitle (+ optional CTA) — the empty-state block copy-pasted across
 * Analytics/Calendar/Projects/IdeaGenerator today. */
export default function EmptyState({ icon, title, body, ctaLabel, onPressCta }: Props) {
  return (
    <View style={styles.container}>
      <IconBadge icon={icon} color={colors.accent} size={56} />
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
      {ctaLabel && onPressCta && (
        <GradientButton label={ctaLabel} onPress={onPressCta} gradient={gradients.brand} style={styles.cta} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', paddingVertical: spacing.xl },
  title: { color: colors.textPrimary, fontSize: 16, fontWeight: '600', marginTop: spacing.md, marginBottom: spacing.xs },
  body: { color: colors.textSecondary, fontSize: 13, textAlign: 'center', lineHeight: 19, paddingHorizontal: spacing.lg },
  cta: { marginTop: spacing.lg, alignSelf: 'stretch' },
});
