import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, glowShadow } from '../theme';

type Props = {
  icon: keyof typeof Ionicons.glyphMap;
  color?: string;
  size?: number;
};

/** A circular icon container with a soft neon glow — the stand-in for the mockups' custom 3D
 * illustrations (a glowing brain, a clapperboard), built from an existing vector icon instead of
 * bespoke art. */
export default function IconBadge({ icon, color = colors.accent, size = 44 }: Props) {
  return (
    <View
      style={[
        styles.base,
        glowShadow(color),
        { width: size, height: size, borderRadius: size / 2, borderColor: color },
      ]}
    >
      <Ionicons name={icon} size={size * 0.5} color={color} />
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.background,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
