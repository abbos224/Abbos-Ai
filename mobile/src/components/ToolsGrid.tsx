import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types';
import type { TranslationKey } from '../i18n';
import { useI18n } from '../i18n/LanguageContext';
import { colors, radius, spacing } from '../theme';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Upload'>;

// Every tile is a real screen — nothing here is a placeholder. Brand Kit / Voice live in this
// stack (registered in App.tsx's CreateStack too); Calendar / Analytics / Projects are sibling
// tabs, reached via getParent().
const TOOLS: {
  key: string;
  labelKey: TranslationKey;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  go: (nav: Nav) => void;
}[] = [
  { key: 'brandKit', labelKey: 'tools.brandKit', icon: 'color-palette', color: colors.accent, go: (n) => n.navigate('BrandKit') },
  { key: 'voice', labelKey: 'tools.voice', icon: 'mic', color: colors.accent, go: (n) => n.navigate('Personas') },
  { key: 'calendar', labelKey: 'tools.calendar', icon: 'calendar', color: colors.accentAI, go: (n) => n.getParent()?.navigate('Calendar' as never) },
  { key: 'analytics', labelKey: 'tools.analytics', icon: 'bar-chart', color: colors.accentAI, go: (n) => n.getParent()?.navigate('Analytics' as never) },
  { key: 'projects', labelKey: 'tools.projects', icon: 'folder', color: colors.accent, go: (n) => n.getParent()?.navigate('Projects' as never) },
];

export default function ToolsGrid({ navigation }: { navigation: Nav }) {
  const { t } = useI18n();
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{t('tools.title')}</Text>
      <View style={styles.grid}>
        {TOOLS.map((tool) => (
          <TouchableOpacity key={tool.key} style={styles.tile} onPress={() => tool.go(navigation)} activeOpacity={0.8}>
            <View style={[styles.iconWrap, { borderColor: tool.color }]}>
              <Ionicons name={tool.icon} size={20} color={tool.color} />
            </View>
            <Text style={styles.label}>{t(tool.labelKey)}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.md },
  title: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: spacing.sm,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: {
    flexBasis: '30%',
    flexGrow: 1,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    gap: spacing.xs,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { color: colors.textPrimary, fontSize: 12, fontWeight: '600' },
});
