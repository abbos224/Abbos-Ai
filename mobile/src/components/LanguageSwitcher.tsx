import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useI18n } from '../i18n/LanguageContext';
import { LANGUAGES } from '../i18n';
import { colors, radius, spacing } from '../theme';

/** A row of language chips (Русский / Oʻzbekcha / English). Switching re-renders every screen
 * that reads from useI18n(), so the whole app updates immediately. */
export default function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { language, setLanguage, t } = useI18n();
  return (
    <View>
      {!compact && <Text style={styles.label}>{t('menu.language')}</Text>}
      <View style={styles.row}>
        {LANGUAGES.map((lang) => {
          const active = language === lang.code;
          return (
            <TouchableOpacity
              key={lang.code}
              onPress={() => setLanguage(lang.code)}
              style={[styles.chip, active && styles.chipActive, compact && styles.chipCompact]}
              activeOpacity={0.8}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{lang.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: spacing.sm,
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipCompact: { paddingVertical: 6, paddingHorizontal: spacing.sm },
  chipActive: { backgroundColor: colors.accentSurface, borderColor: colors.accent },
  chipText: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
  chipTextActive: { color: colors.accent },
});
