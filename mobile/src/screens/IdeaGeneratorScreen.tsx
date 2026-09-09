import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, FlatList } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { IdeaJobSummary, IdeaJobMode, RootStackParamList } from '../types';
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
// Must match server's CONTENT_PLAN_DAY_OPTIONS.
const CONTENT_PLAN_DAY_OPTIONS = [7, 14, 30] as const;

// One generator, five switchable output shapes — a real mode per specialist, not five separate
// screens. Each mode's `buttonLabel`/`placeholder` reflect what it actually produces so the same
// topic input doesn't read as generic across modes.
const MODES: {
  key: IdeaJobMode;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  buttonLabel: string;
  placeholder: string;
}[] = [
  { key: 'topics', label: 'Topics', icon: 'bulb', buttonLabel: 'Generate ideas', placeholder: 'e.g. first-time homebuyer mistakes' },
  { key: 'script', label: 'Script', icon: 'document-text', buttonLabel: 'Generate scripts', placeholder: 'e.g. morning skincare routine for oily skin' },
  { key: 'contentPlan', label: 'Content Plan', icon: 'calendar', buttonLabel: 'Generate content plan', placeholder: 'e.g. home coffee brewing tips' },
  { key: 'shotList', label: 'Shot List', icon: 'videocam', buttonLabel: 'Generate shot list', placeholder: 'e.g. 5-minute desk stretches' },
  { key: 'targeting', label: 'Targeting', icon: 'megaphone', buttonLabel: 'Generate targeting brief', placeholder: 'e.g. eco-friendly cleaning products' },
];

const MODE_BADGE_LABELS: Record<IdeaJobMode, string> = {
  topics: 'Topics',
  script: 'Script',
  contentPlan: 'Content Plan',
  shotList: 'Shot List',
  targeting: 'Targeting',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

const STATUS_LABELS: Record<IdeaJobSummary['status'], string> = {
  generating: 'Generating…',
  done: 'Done',
  failed: 'Failed',
};

export default function IdeaGeneratorScreen({ navigation }: Props) {
  const [mode, setMode] = useState<IdeaJobMode>('topics');
  const [days, setDays] = useState<(typeof CONTENT_PLAN_DAY_OPTIONS)[number]>(7);
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
      const { ideaJobId } = await generateIdeas(trimmed, mode, mode === 'contentPlan' ? days : undefined);
      setTopic('');
      await pollUntilDone(ideaJobId);
    } catch (err) {
      setGenerating(false);
      Alert.alert('Failed to start', err instanceof Error ? err.message : String(err));
    }
  }

  const activeMode = MODES.find((m) => m.key === mode)!;

  return (
    <View style={styles.container}>
      <SectionHeader
        eyebrow="Idea Generator"
        title="Turn a topic into content ideas"
        highlight="content ideas"
        highlightColor={colors.accentAI}
        subtitle="Pick what you need, describe a topic, and get real, ready-to-use output."
      />

      <View style={styles.modeRow}>
        {MODES.map((m) => (
          <TouchableOpacity
            key={m.key}
            onPress={() => setMode(m.key)}
            disabled={generating}
            style={[styles.modeChip, mode === m.key && styles.modeChipActive]}
          >
            <Ionicons name={m.icon} size={13} color={mode === m.key ? colors.onAccent : colors.textSecondary} />
            <Text style={[styles.modeChipText, mode === m.key && styles.modeChipTextActive]}>{m.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {mode === 'contentPlan' && (
        <View style={styles.dayRow}>
          <Text style={styles.dayLabel}>Plan length:</Text>
          {CONTENT_PLAN_DAY_OPTIONS.map((d) => (
            <TouchableOpacity
              key={d}
              onPress={() => setDays(d)}
              disabled={generating}
              style={[styles.dayChip, days === d && styles.dayChipActive]}
            >
              <Text style={[styles.dayChipText, days === d && styles.dayChipTextActive]}>{d} days</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <Card style={styles.inputCard}>
        <TextInput
          style={styles.input}
          placeholder={activeMode.placeholder}
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
        label={activeMode.buttonLabel}
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
          icon="bookmark"
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
                <View style={styles.pastCardHeader}>
                  <Text style={styles.cardTopic} numberOfLines={1}>
                    {item.topic}
                  </Text>
                  <View style={styles.modeBadge}>
                    <Text style={styles.modeBadgeText}>{MODE_BADGE_LABELS[item.mode]}</Text>
                  </View>
                </View>
                <View style={styles.cardFooter}>
                  <Text style={styles.cardMeta}>{formatDate(item.createdAt)}</Text>
                  <Text style={styles.cardMeta}>
                    {item.ideaCount} item{item.ideaCount === 1 ? '' : 's'}
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
  modeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: spacing.sm },
  modeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modeChipActive: { backgroundColor: colors.accentAI, borderColor: colors.accentAI },
  modeChipText: { color: colors.textSecondary, fontSize: 12, fontWeight: '600' },
  modeChipTextActive: { color: colors.onAccent },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.sm },
  dayLabel: { color: colors.textMuted, fontSize: 11 },
  dayChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.sm, backgroundColor: colors.surface },
  dayChipActive: { backgroundColor: colors.accentSurface },
  dayChipText: { color: colors.textSecondary, fontSize: 11, fontWeight: '600' },
  dayChipTextActive: { color: colors.accentAI },
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
  pastCardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cardTopic: { flex: 1, color: colors.textPrimary, fontSize: 15, fontWeight: '600' },
  modeBadge: { backgroundColor: colors.accentSurface, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  modeBadgeText: { color: colors.accentAI, fontSize: 10, fontWeight: '700' },
  cardFooter: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  cardMeta: { color: colors.textMuted, fontSize: 12 },
  cardStatus: { color: colors.success, fontSize: 12, fontWeight: '600' },
  cardStatusFailed: { color: colors.danger },
});
