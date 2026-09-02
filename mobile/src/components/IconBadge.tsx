import React from 'react';
import { View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { colors, glowShadow } from '../theme';

type Props = {
  icon: keyof typeof Ionicons.glyphMap;
  color?: string;
  size?: number;
};

/** A layered, glowing icon badge — the stand-in for the mockups' custom 3D illustrations (a
 * glowing brain, a clapperboard), built from an existing vector icon instead of bespoke art. Two
 * concentric rings (a faint outer ring, a gradient-filled inner circle) plus a shadow-based glow
 * give it real depth instead of reading as a flat bordered circle. */
export default function IconBadge({ icon, color = colors.accent, size = 48 }: Props) {
  const outerSize = Math.round(size * 1.35);
  return (
    <View
      style={[
        styles.outerRing,
        { width: outerSize, height: outerSize, borderRadius: outerSize / 2, borderColor: `${color}33` },
      ]}
    >
      <LinearGradient
        colors={[`${color}40`, `${color}00`]}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={[
          styles.inner,
          glowShadow(color),
          { width: size, height: size, borderRadius: size / 2, borderColor: color },
        ]}
      >
        <Ionicons name={icon} size={size * 0.46} color={color} />
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  outerRing: {
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inner: {
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
