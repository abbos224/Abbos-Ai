import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { resendVerificationEmail, verifyEmail } from '../api';
import { useAuth } from '../AuthContext';
import IconBadge from '../components/IconBadge';
import GradientButton from '../components/GradientButton';
import SectionHeader from '../components/SectionHeader';
import { colors, gradients, radius, spacing } from '../theme';

export default function VerifyEmailScreen() {
  const { user, refreshUser, signOut } = useAuth();
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);

  async function handleVerify() {
    if (!code.trim()) {
      Alert.alert('Missing code', 'Enter the 6-digit code from your email.');
      return;
    }
    setSubmitting(true);
    try {
      await verifyEmail(code.trim());
      await refreshUser();
    } catch (err) {
      Alert.alert('Verification failed', err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    setResending(true);
    try {
      await resendVerificationEmail();
      Alert.alert('Code sent', 'Check your email for a new code.');
    } catch (err) {
      Alert.alert('Failed to resend', err instanceof Error ? err.message : String(err));
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
        eyebrow="One More Step"
        title="Verify your email"
        highlight="email"
        highlightColor={colors.accentAI}
        subtitle={user ? `We sent a 6-digit code to ${user.email}.` : 'We sent you a 6-digit code.'}
      />

      <View style={styles.inputRow}>
        <Ionicons name="keypad-outline" size={18} color={colors.textMuted} style={styles.inputIcon} />
        <TextInput
          style={styles.input}
          placeholder="6-digit code"
          placeholderTextColor={colors.textMuted}
          keyboardType="number-pad"
          maxLength={6}
          value={code}
          onChangeText={setCode}
          editable={!submitting}
        />
      </View>

      <GradientButton
        label="Verify"
        icon="checkmark-circle"
        gradient={gradients.ai}
        onPress={handleVerify}
        loading={submitting}
        style={styles.submitButton}
      />

      <TouchableOpacity onPress={handleResend} disabled={resending} style={styles.linkRow}>
        <Text style={styles.linkText}>
          Didn&rsquo;t get it? <Text style={styles.linkTextAccent}>{resending ? 'Sending…' : 'Resend code'}</Text>
        </Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => signOut()} style={styles.linkRow}>
        <Text style={styles.signOutText}>Sign out</Text>
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
