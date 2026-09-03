import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types';
import { registerUser, googleSignInUrl } from '../api';
import { useAuth } from '../AuthContext';
import IconBadge from '../components/IconBadge';
import GradientButton from '../components/GradientButton';
import SectionHeader from '../components/SectionHeader';
import { colors, gradients, radius, spacing } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'SignUp'>;

export default function SignUpScreen({ navigation }: Props) {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  async function handleSignUp() {
    if (!email.trim() || !password) {
      Alert.alert('Missing info', 'Enter an email and password.');
      return;
    }
    setSubmitting(true);
    try {
      const { token } = await registerUser(email.trim(), password);
      await signIn(token);
    } catch (err) {
      Alert.alert('Sign up failed', err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGoogleSignIn() {
    setGoogleLoading(true);
    try {
      const returnTo = Linking.createURL('/oauth-callback');
      await Linking.openURL(googleSignInUrl(returnTo));
    } catch (err) {
      Alert.alert('Failed to start Google sign-in', err instanceof Error ? err.message : String(err));
    } finally {
      setGoogleLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.iconWrap}>
        <IconBadge icon="person-add" color={colors.accentAI} size={56} />
      </View>
      <SectionHeader eyebrow="Create Account" title="Join ReelAI" highlight="ReelAI" highlightColor={colors.accentAI} />

      <View style={styles.inputRow}>
        <Ionicons name="mail-outline" size={18} color={colors.textMuted} style={styles.inputIcon} />
        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
      </View>
      <View style={styles.inputRow}>
        <Ionicons name="lock-closed-outline" size={18} color={colors.textMuted} style={styles.inputIcon} />
        <TextInput
          style={styles.input}
          placeholder="Password (min 8 characters)"
          placeholderTextColor={colors.textMuted}
          secureTextEntry
          autoComplete="password-new"
          value={password}
          onChangeText={setPassword}
        />
      </View>

      <GradientButton
        label="Sign Up"
        onPress={handleSignUp}
        loading={submitting}
        gradient={gradients.ai}
        style={styles.submitButton}
      />

      <View style={styles.dividerRow}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>or</Text>
        <View style={styles.dividerLine} />
      </View>

      <TouchableOpacity style={styles.googleButton} onPress={handleGoogleSignIn} disabled={googleLoading} activeOpacity={0.85}>
        {googleLoading ? (
          <ActivityIndicator color={colors.background} />
        ) : (
          <>
            <Ionicons name="logo-google" size={18} color="#1F1F1F" style={styles.googleIcon} />
            <Text style={styles.googleButtonText}>Continue with Google</Text>
          </>
        )}
      </TouchableOpacity>

      <TouchableOpacity onPress={() => navigation.replace('Login')} style={styles.linkRow}>
        <Text style={styles.linkText}>
          Already have an account? <Text style={styles.linkTextAccent}>Log in</Text>
        </Text>
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
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.lg },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { color: colors.textMuted, fontSize: 12, marginHorizontal: spacing.sm },
  googleButton: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.lg,
  },
  googleIcon: { marginRight: spacing.sm },
  googleButtonText: { color: '#1F1F1F', fontSize: 15, fontWeight: '600' },
  linkRow: { marginTop: spacing.lg, alignItems: 'center' },
  linkText: { color: colors.textSecondary, fontSize: 13 },
  linkTextAccent: { color: colors.accentAI, fontWeight: '600' },
});
