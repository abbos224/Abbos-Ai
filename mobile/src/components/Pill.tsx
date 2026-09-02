import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';

type Props = {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  color?: string;
};

/** Icon+text badge — the `borderRadius: 999` shape several screens each reimplement on their own
 * (status labels, filter-style chips). */
export default function Pill({ label, icon, color = colors.accent }: Props) {
  return (
    <View style={[styles.base, { borderColor: color }]}>
      {icon && <Ionicons name={icon} size={12} color={color} style={styles.icon} />}
      <Text style={[styles.label, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  icon: { marginRight: 4 },
  label: { fontSize: 12, fontWeight: '700' },
});
