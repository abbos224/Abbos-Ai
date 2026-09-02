import React from 'react';
import { View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius, spacing } from '../theme';

type Props = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** 'highlight' gives the card a colored, glowing border for callout-style content (a tip card,
   * a featured action) instead of the default neutral border. */
  variant?: 'default' | 'highlight';
  highlightColor?: string;
};

/** The bordered-surface card shape almost every screen redefines locally today — extracted so
 * future style tweaks happen in one place instead of ~10 copy-pasted StyleSheets. */
export default function Card({ children, style, variant = 'default', highlightColor = colors.accent }: Props) {
  return (
    <View
      style={[
        styles.base,
        variant === 'highlight' && {
          borderColor: highlightColor,
          shadowColor: highlightColor,
          shadowOpacity: 0.35,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 0 },
          elevation: 4,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
});
