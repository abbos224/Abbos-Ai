import React from 'react';
import { Text, TouchableOpacity, ActivityIndicator, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { colors, gradients, radius, spacing } from '../theme';

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  /** Which gradient token to use — `gradients.ai` for AI-generation actions, `gradients.brand`
   * (default) for general primary actions. */
  gradient?: readonly [string, string];
  style?: StyleProp<ViewStyle>;
};

export default function GradientButton({
  label,
  onPress,
  disabled,
  loading,
  icon,
  gradient = gradients.brand,
  style,
}: Props) {
  return (
    <TouchableOpacity onPress={onPress} disabled={disabled || loading} activeOpacity={0.85} style={style}>
      <LinearGradient
        colors={gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[styles.base, disabled && styles.disabled]}
      >
        {loading ? (
          <ActivityIndicator color={colors.onAccent} />
        ) : (
          <>
            {icon && <Ionicons name={icon} size={18} color={colors.onAccent} style={styles.icon} />}
            <Text style={styles.label}>{label}</Text>
          </>
        )}
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    borderRadius: radius.md,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.6 },
  icon: { marginRight: spacing.xs },
  label: { color: colors.onAccent, fontSize: 15, fontWeight: '600' },
});
