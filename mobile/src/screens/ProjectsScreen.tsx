import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { JobSummary, RootStackParamList } from '../types';
import { getAllJobs } from '../api';
import Card from '../components/Card';
import IconBadge from '../components/IconBadge';
import EmptyState from '../components/EmptyState';
import { colors, glowShadow, radius, spacing } from '../theme';

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

  // ProjectsScreen lives inside a nested stack (ProjectsStack) within the root Tab.Navigator, so
  // jumping to the Create tab is a cross-navigator hop — getParent() reaches the tab navigator,
  // which isn't typed against this stack's RootStackParamList, hence the cast.
  function goToCreate() {
    navigation.getParent()?.navigate('Create' as never);
  }

  if (jobs === null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <IconBadge icon="folder" color={colors.accent} size={40} />
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>Projects</Text>
          <Text style={styles.headerSubtitle}>All your AI-generated Reels in one place.</Text>
        </View>
        <TouchableOpacity onPress={goToCreate} style={[styles.addButton, glowShadow(colors.accent)]}>
          <Ionicons name="add" size={22} color={colors.accent} />
        </TouchableOpacity>
      </View>

      {jobs.length === 0 ? (
        <Card variant="highlight" style={styles.emptyCard}>
          <EmptyState
            icon="folder"
            title="No projects yet"
            body="Create your first AI-powered Reel and it will appear here."
            ctaLabel="Create your first Reel"
            onPressCta={goToCreate}
          />
        </Card>
      ) : (
        <FlatList
          data={jobs}
          keyExtractor={(job) => job.id}
          refreshing={loading}
          onRefresh={load}
          renderItem={({ item }) => (
            <TouchableOpacity
              disabled={item.status !== 'done'}
              onPress={() => navigation.navigate('Results', { jobId: item.id })}
              activeOpacity={0.85}
            >
              <Card style={styles.card}>
                <View style={styles.cardRow}>
                  <View style={styles.fileIcon}>
                    <Ionicons name="videocam-outline" size={20} color={colors.accent} />
                  </View>
                  <View style={styles.cardBody}>
                    <Text style={styles.cardFilename} numberOfLines={1}>
                      {item.originalFilename}
                    </Text>
                    <View style={styles.cardFooter}>
                      <Ionicons name="calendar-outline" size={12} color={colors.textMuted} />
                      <Text style={styles.cardMeta}>{formatDate(item.createdAt)}</Text>
                      <Text style={styles.cardMeta}>
                        {item.clipCount} clip{item.clipCount === 1 ? '' : 's'}
                      </Text>
                      <Text style={[styles.cardStatus, item.status === 'failed' && styles.cardStatusFailed]}>
                        {STATUS_LABELS[item.status]}
                      </Text>
                    </View>
                  </View>
                </View>
              </Card>
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
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.lg },
  headerText: { flex: 1, marginHorizontal: spacing.md },
  headerTitle: { color: colors.textPrimary, fontSize: 22, fontWeight: '700' },
  headerSubtitle: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  addButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCard: { borderStyle: 'dashed' },
  card: { marginBottom: spacing.sm },
  cardRow: { flexDirection: 'row', alignItems: 'center' },
  fileIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.accentSurface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  cardBody: { flex: 1 },
  cardFilename: { color: colors.textPrimary, fontSize: 15, fontWeight: '600' },
  cardFooter: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.sm },
  cardMeta: { color: colors.textMuted, fontSize: 12, marginRight: spacing.sm },
  cardStatus: { color: colors.success, fontSize: 12, fontWeight: '600' },
  cardStatusFailed: { color: colors.danger },
});
