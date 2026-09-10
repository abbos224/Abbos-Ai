import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useI18n } from '../i18n/LanguageContext';
import { colors, radius, spacing } from '../theme';

/** Full-screen "couldn't load — tap to retry" state, the counterpart to a bare ActivityIndicator
 * for screens that fetch one resource on mount. `accent` tints the retry button so it matches the
 * screen it's used on (violet for clips, cyan for AI surfaces). */
export default function LoadError({ onRetry, accent = colors.accent }: { onRetry: () => void; accent?: string }) {
  const { t } = useI18n();
  return (
    <View style={styles.center}>
      <Text style={styles.text}>{t('common.loadFailed')}</Text>
      <TouchableOpacity style={[styles.button, { borderColor: accent }]} onPress={onRetry} activeOpacity={0.85}>
        <Text style={[styles.buttonText, { color: accent }]}>{t('common.retry')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  text: { color: colors.textSecondary, fontSize: 14, textAlign: 'center', marginBottom: spacing.md },
  button: { borderWidth: 1, borderRadius: radius.md, paddingVertical: 10, paddingHorizontal: spacing.lg },
  buttonText: { fontSize: 13, fontWeight: '600' },
});
