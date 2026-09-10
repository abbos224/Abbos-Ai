import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { JobStatus, RootStackParamList } from '../types';
import { getJob } from '../api';
import { useI18n } from '../i18n/LanguageContext';
import type { TranslationKey } from '../i18n';
import { colors, radius, spacing } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Processing'>;

const STEP_KEYS: Record<JobStatus, TranslationKey> = {
  uploaded: 'processing.step.uploaded',
  transcribing: 'processing.step.transcribing',
  analyzing: 'processing.step.analyzing',
  rendering: 'processing.step.rendering',
  done: 'processing.step.done',
  failed: 'processing.step.failed',
};

export default function ProcessingScreen({ route, navigation }: Props) {
  const { jobId } = route.params;
  const { t } = useI18n();
  const [status, setStatus] = useState<JobStatus>('uploaded');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const job = await getJob(jobId);
        if (cancelled) return;
        setStatus(job.status);
        if (job.status === 'done') {
          navigation.replace('Results', { jobId });
        } else if (job.status === 'failed') {
          setError(job.error ?? t('processing.unknownError'));
        }
      } catch {
        // transient network hiccup — keep polling
      }
    }

    poll();
    const interval = setInterval(poll, 2500);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [jobId, navigation, t]);

  return (
    <View style={styles.container}>
      {error ? (
        <>
          <Text style={styles.errorTitle}>{t('processing.failedTitle')}</Text>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.replace('Upload')}>
            <Text style={styles.backButtonText}>{t('processing.tryAnother')}</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.statusText}>{t(STEP_KEYS[status])}</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  statusText: { color: colors.textSecondary, fontSize: 15, marginTop: spacing.md, textAlign: 'center' },
  errorTitle: { color: colors.danger, fontSize: 18, fontWeight: '600', marginBottom: spacing.sm },
  errorText: { color: colors.textSecondary, fontSize: 14, textAlign: 'center', marginBottom: spacing.lg },
  backButton: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: 24,
  },
  backButtonText: { color: colors.textPrimary, fontWeight: '600' },
});
