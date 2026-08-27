import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { JobStatus, RootStackParamList } from '../types';
import { getJob } from '../api';

type Props = NativeStackScreenProps<RootStackParamList, 'Processing'>;

const STEP_LABELS: Record<JobStatus, string> = {
  uploaded: 'Uploaded, starting up…',
  transcribing: 'Transcribing speech…',
  analyzing: 'AI is finding the best moments…',
  rendering: 'Editing your Reels…',
  done: 'Done!',
  failed: 'Something went wrong',
};

export default function ProcessingScreen({ route, navigation }: Props) {
  const { jobId } = route.params;
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
          setError(job.error ?? 'Unknown error');
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
  }, [jobId, navigation]);

  return (
    <View style={styles.container}>
      {error ? (
        <>
          <Text style={styles.errorTitle}>Processing failed</Text>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.replace('Upload')}>
            <Text style={styles.backButtonText}>Try another video</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <ActivityIndicator size="large" color="#6C5CE7" />
          <Text style={styles.statusText}>{STEP_LABELS[status]}</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0B0F', alignItems: 'center', justifyContent: 'center', padding: 24 },
  statusText: { color: '#fff', fontSize: 16, marginTop: 20, textAlign: 'center' },
  errorTitle: { color: '#FF6B6B', fontSize: 20, fontWeight: '700', marginBottom: 12 },
  errorText: { color: '#B8B8C2', fontSize: 14, textAlign: 'center', marginBottom: 24 },
  backButton: { backgroundColor: '#1F1F27', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 24 },
  backButtonText: { color: '#fff', fontWeight: '600' },
});
