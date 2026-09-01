import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthUser, RootStackParamList } from '../types';
import { getCurrentUser } from '../api';
import { getToken, clearToken } from '../authStorage';
import { colors, radius, spacing } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Menu'>;

export default function MenuScreen({ navigation }: Props) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setCheckingAuth(true);
      getToken()
        .then((token) => (token ? getCurrentUser(token) : null))
        .then((current) => {
          if (!cancelled) setUser(current);
        })
        .catch(() => {
          if (!cancelled) setUser(null);
        })
        .finally(() => {
          if (!cancelled) setCheckingAuth(false);
        });
      return () => {
        cancelled = true;
      };
    }, [])
  );

  async function handleLogOut() {
    await clearToken();
    setUser(null);
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>Account</Text>
      <View style={styles.card}>
        {checkingAuth ? (
          <ActivityIndicator color={colors.accent} />
        ) : user ? (
          <>
            <Text style={styles.accountEmail}>{user.email}</Text>
            <TouchableOpacity onPress={handleLogOut} style={styles.rowLink}>
              <Text style={styles.rowLinkTextDanger}>Log out</Text>
            </TouchableOpacity>
          </>
        ) : (
          <View style={styles.authLinksRow}>
            <TouchableOpacity onPress={() => navigation.navigate('Login')}>
              <Text style={styles.rowLinkTextAccent}>Log in</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => navigation.navigate('SignUp')}>
              <Text style={styles.rowLinkTextAccent}>Sign up</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <Text style={styles.sectionTitle}>Content settings</Text>
      <View style={styles.card}>
        <TouchableOpacity style={styles.row} onPress={() => navigation.navigate('BrandKit')}>
          <Text style={styles.rowText}>Brand Kit</Text>
          <Text style={styles.rowChevron}>›</Text>
        </TouchableOpacity>
        <View style={styles.rowDivider} />
        <TouchableOpacity style={styles.row} onPress={() => navigation.navigate('Personas')}>
          <Text style={styles.rowText}>Voice</Text>
          <Text style={styles.rowChevron}>›</Text>
        </TouchableOpacity>
      </View>
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
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  accountEmail: { color: colors.textPrimary, fontSize: 15, fontWeight: '600' },
  authLinksRow: { flexDirection: 'row', gap: spacing.lg },
  rowLink: { marginTop: spacing.sm },
  rowLinkTextAccent: { color: colors.accent, fontSize: 14, fontWeight: '600' },
  rowLinkTextDanger: { color: colors.danger, fontSize: 14, fontWeight: '600' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 },
  rowText: { color: colors.textPrimary, fontSize: 15, fontWeight: '600' },
  rowChevron: { color: colors.textMuted, fontSize: 18 },
  rowDivider: { height: 1, backgroundColor: colors.border },
});
