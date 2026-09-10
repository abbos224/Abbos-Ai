import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { resendVerificationEmail, verifyEmail } from '../api';
import { useAuth } from '../AuthContext';
import { useI18n } from '../i18n/LanguageContext';
import IconBadge from '../components/IconBadge';
import GradientButton from '../components/GradientButton';
import SectionHeader from '../components/SectionHeader';
import { colors, gradients, radius, spacing } from '../theme';

export default function VerifyEmailScreen() {
  const { user, refreshUser, signOut } = useAuth();
  const { t } = useI18n();
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);

  async function handleVerify() {
    if (!code.trim()) {
      Alert.alert(t('verify.missingTitle'), t('verify.missingBody'));
      return;
    }
    setSubmitting(true);
    try {
      await verifyEmail(code.trim());
      await refreshUser();
    } catch (err) {
      Alert.alert(t('verify.failed'), err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    setResending(true);
    try {
      await resendVerificationEmail();
      Alert.alert(t('verify.codeSentTitle'), t('verify.codeSentBody'));
    } catch (err) {
      Alert.alert(t('verify.resendFailed'), err instanceof Error ? err.message : String(err));
    } finally {
      setResending(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.iconWrap}>
        <IconBadge icon="mail-open" color={colors.accentAI} size={56} />
      </View>
      <SectionHeader
        eyebrow={t('verify.eyebrow')}
        title={t('verify.title')}
        highlightColor={colors.accentAI}
        subtitle={user ? t('verify.subtitleWithEmail', { email: user.email }) : t('verify.subtitleNoEmail')}
      />

      <View style={styles.inputRow}>
        <Ionicons name="keypad-outline" size={18} color={colors.textMuted} style={styles.inputIcon} />
        <TextInput
          style={styles.input}
          placeholder={t('verify.codePlaceholder')}
          placeholderTextColor={colors.textMuted}
          keyboardType="number-pad"
          maxLength={6}
          value={code}
          onChangeText={setCode}
          editable={!submitting}
        />
      </View>

      <GradientButton
        label={t('verify.submit')}
        icon="checkmark-circle"
        gradient={gradients.ai}
        onPress={handleVerify}
        loading={submitting}
        style={styles.submitButton}
      />

      <TouchableOpacity onPress={handleResend} disabled={resending} style={styles.linkRow}>
        <Text style={styles.linkText}>
          {t('verify.resendPrefix')}{' '}
          <Text style={styles.linkTextAccent}>{resending ? t('verify.resending') : t('verify.resend')}</Text>
        </Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => signOut()} style={styles.linkRow}>
        <Text style={styles.signOutText}>{t('verify.signOut')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: spacing.lg, paddingTop: 80 },
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
  linkRow: { marginTop: spacing.lg, alignItems: 'center' },
  linkText: { color: colors.textSecondary, fontSize: 13 },
  linkTextAccent: { color: colors.accentAI, fontWeight: '600' },
  signOutText: { color: colors.textMuted, fontSize: 13 },
});
