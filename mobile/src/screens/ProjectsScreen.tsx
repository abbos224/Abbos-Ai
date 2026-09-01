import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { JobSummary, RootStackParamList } from '../types';
import { getAllJobs } from '../api';
import { colors, radius, spacing } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Projects'>;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

const STATUS_LABELS: Record<JobSummary['status'], string> = {
  uploaded: 'Uploaded',
  transcribing: 'Transcribing…',
  analyzing: 'Analyzing…',
  rendering: 'Rendering…',
  done: 'Done',
  failed: 'Failed',
};

export default function ProjectsScreen({ navigation }: Props) {
  const [jobs, setJobs] = useState<JobSummary[] | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    getAllJobs()
      .then(setJobs)
      .catch((err) => Alert.alert('Failed to load projects', err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(load);

  if (jobs === null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Projects</Text>

      {jobs.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No projects yet</Text>
          <Text style={styles.emptyBody}>Upload a video from the Create tab to see it here.</Text>
        </View>
      ) : (
        <FlatList
          data={jobs}
          keyExtractor={(job) => job.id}
          refreshing={loading}
          onRefresh={load}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              disabled={item.status !== 'done'}
              onPress={() => navigation.navigate('Results', { jobId: item.id })}
            >
              <Text style={styles.cardFilename} numberOfLines={1}>
                {item.originalFilename}
              </Text>
              <View style={styles.cardFooter}>
                <Text style={styles.cardMeta}>{formatDate(item.createdAt)}</Text>
                <Text style={styles.cardMeta}>
                  {item.clipCount} clip{item.clipCount === 1 ? '' : 's'}
                </Text>
                <Text style={[styles.cardStatus, item.status === 'failed' && styles.cardStatusFailed]}>
                  {STATUS_LABELS[item.status]}
                </Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: spacing.lg, paddingTop: 60 },
  center: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.textPrimary, fontSize: 20, fontWeight: '600', marginBottom: spacing.md },
  emptyState: { marginTop: spacing.xl, alignItems: 'center' },
  emptyTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: '600', marginBottom: spacing.xs },
  emptyBody: { color: colors.textSecondary, fontSize: 13, textAlign: 'center', lineHeight: 19 },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  cardFilename: { color: colors.textPrimary, fontSize: 15, fontWeight: '600' },
  cardFooter: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  cardMeta: { color: colors.textMuted, fontSize: 12 },
  cardStatus: { color: colors.success, fontSize: 12, fontWeight: '600' },
  cardStatusFailed: { color: colors.danger },
});
