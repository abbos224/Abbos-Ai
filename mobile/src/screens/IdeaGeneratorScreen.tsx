import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, FlatList } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { IdeaJobSummary, RootStackParamList } from '../types';
import { generateIdeas, getAllIdeaJobs, getIdeaJob } from '../api';
import { colors, radius, spacing } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'IdeaGenerator'>;

const POLL_INTERVAL_MS = 2000;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

const STATUS_LABELS: Record<IdeaJobSummary['status'], string> = {
  generating: 'Generating…',
  done: 'Done',
  failed: 'Failed',
};

export default function IdeaGeneratorScreen({ navigation }: Props) {
  const [topic, setTopic] = useState('');
  const [generating, setGenerating] = useState(false);
  const [pastIdeas, setPastIdeas] = useState<IdeaJobSummary[] | null>(null);
  const [loadingPast, setLoadingPast] = useState(false);
  const cancelledRef = useRef(false);

  useEffect(() => {
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  const loadPastIdeas = useCallback(() => {
    setLoadingPast(true);
    getAllIdeaJobs()
      .then(setPastIdeas)
      .catch((err) => Alert.alert('Failed to load past ideas', err instanceof Error ? err.message : String(err)))
      .finally(() => setLoadingPast(false));
  }, []);

  useFocusEffect(loadPastIdeas);

  // A single Claude call is fast enough that a full multi-stage Processing screen (like the video
  // pipeline's) isn't warranted — just poll in place until the idea job leaves "generating".
  async function pollUntilDone(ideaJobId: string) {
    while (!cancelledRef.current) {
      const job = await getIdeaJob(ideaJobId);
      if (job.status === 'done') {
        setGenerating(false);
        loadPastIdeas();
        navigation.navigate('IdeaResults', { ideaJobId });
        return;
      }
      if (job.status === 'failed') {
        setGenerating(false);
        loadPastIdeas();
        Alert.alert('Generation failed', job.error ?? 'Something went wrong.');
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }

  async function handleGenerate() {
    const trimmed = topic.trim();
    if (!trimmed) {
      Alert.alert('Missing topic', 'Type a topic or niche first.');
      return;
    }
    setGenerating(true);
    try {
      const { ideaJobId } = await generateIdeas(trimmed);
      setTopic('');
      await pollUntilDone(ideaJobId);
    } catch (err) {
      setGenerating(false);
      Alert.alert('Failed to start', err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.eyebrow}>Idea Generator</Text>
        <Text style={styles.title}>Turn a topic into content ideas</Text>
      </View>

      <TextInput
        style={styles.input}
        placeholder="e.g. first-time homebuyer mistakes"
        placeholderTextColor={colors.textMuted}
        value={topic}
        onChangeText={setTopic}
        editable={!generating}
      />

      <TouchableOpacity style={styles.primaryButton} onPress={handleGenerate} disabled={generating}>
        {generating ? (
          <ActivityIndicator color={colors.onAccent} />
        ) : (
          <Text style={styles.primaryButtonText}>Generate ideas</Text>
        )}
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>Past ideas</Text>
      {pastIdeas === null ? (
        <ActivityIndicator color={colors.accent} style={styles.pastLoading} />
      ) : pastIdeas.length === 0 ? (
        <Text style={styles.emptyBody}>Generated ideas will show up here.</Text>
      ) : (
        <FlatList
          style={styles.list}
          data={pastIdeas}
          keyExtractor={(job) => job.id}
          refreshing={loadingPast}
          onRefresh={loadPastIdeas}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              disabled={item.status !== 'done'}
              onPress={() => navigation.navigate('IdeaResults', { ideaJobId: item.id })}
            >
              <Text style={styles.cardTopic} numberOfLines={1}>
                {item.topic}
              </Text>
              <View style={styles.cardFooter}>
                <Text style={styles.cardMeta}>{formatDate(item.createdAt)}</Text>
                <Text style={styles.cardMeta}>
                  {item.ideaCount} idea{item.ideaCount === 1 ? '' : 's'}
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
  headerRow: { marginBottom: spacing.xl },
  eyebrow: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  title: { color: colors.textPrimary, fontSize: 24, fontWeight: '600' },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    color: colors.textPrimary,
    fontSize: 15,
    marginBottom: spacing.sm,
  },
  primaryButton: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  primaryButtonText: { color: colors.onAccent, fontSize: 15, fontWeight: '600' },
  sectionTitle: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: spacing.sm,
  },
  pastLoading: { marginTop: spacing.md },
  emptyBody: { color: colors.textSecondary, fontSize: 13 },
  list: { flex: 1 },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  cardTopic: { color: colors.textPrimary, fontSize: 15, fontWeight: '600' },
  cardFooter: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  cardMeta: { color: colors.textMuted, fontSize: 12 },
  cardStatus: { color: colors.success, fontSize: 12, fontWeight: '600' },
  cardStatusFailed: { color: colors.danger },
});
