import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, FlatList } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { IdeaJobSummary, RootStackParamList } from '../types';
import { generateIdeas, getAllIdeaJobs, getIdeaJob } from '../api';
import Card from '../components/Card';
import GradientButton from '../components/GradientButton';
import SectionHeader from '../components/SectionHeader';
import EmptyState from '../components/EmptyState';
import { colors, gradients, radius, spacing } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'IdeaGenerator'>;

const POLL_INTERVAL_MS = 2000;
// Must match server/src/index.ts's MAX_TOPIC_LENGTH — the two aren't shared from one source since
// mobile and server don't share a package in this repo, so keep them in sync by hand.
const MAX_TOPIC_LENGTH = 200;

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
      <SectionHeader
        eyebrow="Idea Generator"
        title="Turn a topic into content ideas"
        highlight="content ideas"
        highlightColor={colors.accentAI}
        subtitle="Describe your topic and get unique, engaging ideas that stand out."
      />

      <Card style={styles.inputCard}>
        <TextInput
          style={styles.input}
          placeholder="e.g. first-time homebuyer mistakes"
          placeholderTextColor={colors.textMuted}
          value={topic}
          onChangeText={(text) => setTopic(text.slice(0, MAX_TOPIC_LENGTH))}
          editable={!generating}
          multiline
        />
        <Text style={styles.charCount}>
          {topic.length}/{MAX_TOPIC_LENGTH}
        </Text>
      </Card>

      <GradientButton
        label="Generate ideas"
        icon="sparkles"
        gradient={gradients.ai}
        onPress={handleGenerate}
        loading={generating}
        style={styles.generateButton}
      />

      <Text style={styles.sectionTitle}>Past ideas</Text>
      {pastIdeas === null ? (
        <ActivityIndicator color={colors.accentAI} style={styles.pastLoading} />
      ) : pastIdeas.length === 0 ? (
        <EmptyState
          icon="bookmark-outline"
          title="No ideas yet"
          body="Your generated ideas will appear here. Start by describing a topic above."
        />
      ) : (
        <FlatList
          style={styles.list}
          data={pastIdeas}
          keyExtractor={(job) => job.id}
          refreshing={loadingPast}
          onRefresh={loadPastIdeas}
          renderItem={({ item }) => (
            <TouchableOpacity
              disabled={item.status !== 'done'}
              onPress={() => navigation.navigate('IdeaResults', { ideaJobId: item.id })}
              activeOpacity={0.85}
            >
              <Card style={styles.pastCard}>
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
  inputCard: { marginBottom: spacing.md },
  input: { color: colors.textPrimary, fontSize: 15, minHeight: 44 },
  charCount: { color: colors.textMuted, fontSize: 11, textAlign: 'right', marginTop: spacing.xs },
  generateButton: { marginBottom: spacing.lg },
  sectionTitle: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: spacing.sm,
  },
  pastLoading: { marginTop: spacing.md },
  list: { flex: 1 },
  pastCard: { marginBottom: spacing.sm },
  cardTopic: { color: colors.textPrimary, fontSize: 15, fontWeight: '600' },
  cardFooter: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  cardMeta: { color: colors.textMuted, fontSize: 12 },
  cardStatus: { color: colors.success, fontSize: 12, fontWeight: '600' },
  cardStatusFailed: { color: colors.danger },
});
