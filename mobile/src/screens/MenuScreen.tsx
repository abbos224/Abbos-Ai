import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types';
import { useAuth } from '../AuthContext';
import { useI18n } from '../i18n/LanguageContext';
import Card from '../components/Card';
import IconBadge from '../components/IconBadge';
import LanguageSwitcher from '../components/LanguageSwitcher';
import { colors, spacing } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Menu'>;

const SETTINGS_ROWS: Array<{ icon: keyof typeof Ionicons.glyphMap; labelKey: 'menu.brandKit' | 'menu.voice'; target: 'BrandKit' | 'Personas' }> = [
  { icon: 'color-palette', labelKey: 'menu.brandKit', target: 'BrandKit' },
  { icon: 'mic', labelKey: 'menu.voice', target: 'Personas' },
];

export default function MenuScreen({ navigation }: Props) {
  // Login is mandatory app-wide (see App.tsx's auth gate), so by the time Menu is reachable
  // `user` is always populated — this section is really just account info + log out, but the
  // Login/SignUp links are kept as a defensive fallback for the instant between signOut() and the
  // gate swapping the screen away.
  const { user, signOut } = useAuth();
  const { t } = useI18n();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>{t('menu.account')}</Text>
      <Card style={styles.accountCard}>
        <IconBadge icon="person" color={colors.accent} size={40} />
        <View style={styles.accountInfo}>
          {user ? (
            <>
              <Text style={styles.accountEmail} numberOfLines={1}>
                {user.email}
              </Text>
              <TouchableOpacity onPress={signOut} style={styles.rowLink}>
                <Text style={styles.rowLinkTextDanger}>{t('menu.logOut')}</Text>
              </TouchableOpacity>
            </>
          ) : (
            <View style={styles.authLinksRow}>
              <TouchableOpacity onPress={() => navigation.navigate('Login')}>
                <Text style={styles.rowLinkTextAccent}>{t('menu.logIn')}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => navigation.navigate('SignUp')}>
                <Text style={styles.rowLinkTextAccent}>{t('menu.signUp')}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </Card>

      <Text style={styles.sectionTitle}>{t('menu.language')}</Text>
      <Card>
        <LanguageSwitcher compact />
      </Card>

      <Text style={styles.sectionTitle}>{t('menu.contentSettings')}</Text>
      <Card style={styles.settingsCard}>
        {SETTINGS_ROWS.map((item, i) => (
          <View key={item.target}>
            <TouchableOpacity style={styles.row} onPress={() => navigation.navigate(item.target)} activeOpacity={0.7}>
              <Ionicons name={item.icon} size={18} color={colors.accent} style={styles.rowIcon} />
              <Text style={styles.rowText}>{t(item.labelKey)}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>
            {i < SETTINGS_ROWS.length - 1 && <View style={styles.rowDivider} />}
          </View>
        ))}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  sectionTitle: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  accountCard: { flexDirection: 'row', alignItems: 'center' },
  accountInfo: { flex: 1, marginLeft: spacing.md },
  settingsCard: { padding: 0 },
  accountEmail: { color: colors.textPrimary, fontSize: 15, fontWeight: '600' },
  authLinksRow: { flexDirection: 'row', gap: spacing.lg },
  rowLink: { marginTop: spacing.xs },
  rowLinkTextAccent: { color: colors.accent, fontSize: 14, fontWeight: '600' },
  rowLinkTextDanger: { color: colors.danger, fontSize: 14, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: spacing.md, gap: spacing.sm },
  rowIcon: { marginRight: 2 },
  rowText: { flex: 1, color: colors.textPrimary, fontSize: 15, fontWeight: '600' },
  rowDivider: { height: 1, backgroundColor: colors.border, marginLeft: spacing.md + 18 + spacing.sm },
});
