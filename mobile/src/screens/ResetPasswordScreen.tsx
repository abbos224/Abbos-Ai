import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types';
import { resetPassword } from '../api';
import { useAuth } from '../AuthContext';
import { useI18n } from '../i18n/LanguageContext';
import IconBadge from '../components/IconBadge';
import GradientButton from '../components/GradientButton';
import SectionHeader from '../components/SectionHeader';
import { colors, gradients, radius, spacing } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'ResetPassword'>;

export default function ResetPasswordScreen({ route }: Props) {
  const { signIn } = useAuth();
  const { t } = useI18n();
  const [email, setEmail] = useState(route.params.email);
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!email.trim() || !code.trim()) {
      Alert.alert(t('auth.missingInfoTitle'), t('reset.missingBody'));
      return;
    }
    if (newPassword.length < 8) {
      Alert.alert(t('reset.weakTitle'), t('reset.weakBody'));
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert(t('reset.mismatchTitle'), t('reset.mismatchBody'));
      return;
    }
    setSubmitting(true);
    try {
      const { token } = await resetPassword(email.trim(), code.trim(), newPassword);
      await signIn(token);
    } catch (err) {
      Alert.alert(t('reset.failed'), err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.iconWrap}>
        <IconBadge icon="key" color={colors.accent} size={56} />
      </View>
      <SectionHeader
        eyebrow={t('reset.eyebrow')}
        title={t('reset.title')}
        subtitle={t('reset.subtitle')}
      />

      <View style={styles.inputRow}>
        <Ionicons name="mail-outline" size={18} color={colors.textMuted} style={styles.inputIcon} />
        <TextInput
          style={styles.input}
          placeholder={t('auth.emailPlaceholder')}
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
      </View>
      <View style={styles.inputRow}>
        <Ionicons name="keypad-outline" size={18} color={colors.textMuted} style={styles.inputIcon} />
        <TextInput
          style={styles.input}
          placeholder={t('reset.codePlaceholder')}
          placeholderTextColor={colors.textMuted}
          keyboardType="number-pad"
          maxLength={6}
          value={code}
          onChangeText={setCode}
        />
      </View>
      <View style={styles.inputRow}>
        <Ionicons name="lock-closed-outline" size={18} color={colors.textMuted} style={styles.inputIcon} />
        <TextInput
          style={styles.input}
          placeholder={t('reset.newPasswordPlaceholder')}
          placeholderTextColor={colors.textMuted}
          secureTextEntry
          autoComplete="password-new"
          value={newPassword}
          onChangeText={setNewPassword}
        />
      </View>
      <View style={styles.inputRow}>
        <Ionicons name="lock-closed-outline" size={18} color={colors.textMuted} style={styles.inputIcon} />
        <TextInput
          style={styles.input}
          placeholder={t('reset.confirmPlaceholder')}
          placeholderTextColor={colors.textMuted}
          secureTextEntry
          autoComplete="password-new"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
        />
      </View>

      <GradientButton
        label={t('reset.submit')}
        onPress={handleSubmit}
        loading={submitting}
        gradient={gradients.brand}
        style={styles.submitButton}
      />

      <Text style={styles.hintText}>{t('reset.hint')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: spacing.lg, paddingTop: 60 },
  iconWrap: { alignItems: 'center', marginBottom: spacing.lg },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  inputIcon: { marginRight: spacing.sm },
  input: { flex: 1, color: colors.textPrimary, fontSize: 15, paddingVertical: 14 },
  submitButton: { marginTop: spacing.sm },
  hintText: { color: colors.textMuted, fontSize: 12, textAlign: 'center', marginTop: spacing.lg },
});
