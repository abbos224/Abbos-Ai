import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, FlatList } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { IdeaJobSummary, IdeaJobMode, RootStackParamList } from '../types';
import { generateIdeas, getAllIdeaJobs, getIdeaJob } from '../api';
import { useI18n } from '../i18n/LanguageContext';
import type { TranslationKey } from '../i18n';
import { ensureNotificationPermission, notifyIfBackgrounded } from '../notifications';
import { useDraft } from '../useDraft';
import { formatDate } from '../utils/format';
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

// One generator, five switchable output shapes — a real mode per specialist. Only the icon is
// static here; every user-facing string is a translation key resolved through `t()` at render.
const MODES: {
  key: IdeaJobMode;
  icon: keyof typeof Ionicons.glyphMap;
  labelKey: TranslationKey;
  buttonKey: TranslationKey;
  placeholderKey: TranslationKey;
  descriptionKey: TranslationKey;
}[] = [
  { key: 'topics', icon: 'bulb', labelKey: 'idea.mode.topics', buttonKey: 'idea.button.topics', placeholderKey: 'idea.placeholder.topics', descriptionKey: 'idea.desc.topics' },
  { key: 'script', icon: 'document-text', labelKey: 'idea.mode.script', buttonKey: 'idea.button.script', placeholderKey: 'idea.placeholder.script', descriptionKey: 'idea.desc.script' },
  { key: 'contentPlan', icon: 'calendar', labelKey: 'idea.mode.contentPlan', buttonKey: 'idea.button.contentPlan', placeholderKey: 'idea.placeholder.contentPlan', descriptionKey: 'idea.desc.contentPlan' },
  { key: 'shotList', icon: 'videocam', labelKey: 'idea.mode.shotList', buttonKey: 'idea.button.shotList', placeholderKey: 'idea.placeholder.shotList', descriptionKey: 'idea.desc.shotList' },
  { key: 'targeting', icon: 'megaphone', labelKey: 'idea.mode.targeting', buttonKey: 'idea.button.targeting', placeholderKey: 'idea.placeholder.targeting', descriptionKey: 'idea.desc.targeting' },
];

const MODE_BADGE_KEYS: Record<IdeaJobMode, TranslationKey> = {
  topics: 'idea.mode.topics',
  script: 'idea.mode.script',
  contentPlan: 'idea.mode.contentPlan',
  shotList: 'idea.mode.shotList',
  targeting: 'idea.mode.targeting',
};

const STATUS_KEYS: Record<IdeaJobSummary['status'], TranslationKey> = {
  generating: 'idea.status.generating',
  done: 'idea.status.done',
  failed: 'idea.status.failed',
};


export default function IdeaGeneratorScreen({ navigation, route }: Props) {
  const { t } = useI18n();
  const prefill = route.params;
  const [mode, setMode] = useState<IdeaJobMode>(prefill?.prefillMode ?? 'topics');
  const [days, setDays] = useState<(typeof CONTENT_PLAN_DAY_OPTIONS)[number]>(
    CONTENT_PLAN_DAY_OPTIONS.find((d) => d === prefill?.prefillDays) ?? 7,
  );
  const [topic, setTopic, clearTopicDraft] = useDraft('ideaTopic', prefill?.prefillTopic ?? '');
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
      .catch((err) => Alert.alert(t('idea.loadPastFailed'), err instanceof Error ? err.message : String(err)))
      .finally(() => setLoadingPast(false));
  }, [t]);

  useFocusEffect(loadPastIdeas);

  // A single Claude call is fast enough that a full multi-stage Processing screen (like the video
  // pipeline's) isn't warranted — just poll in place until the idea job leaves "generating".
  async function pollUntilDone(ideaJobId: string) {
    while (!cancelledRef.current) {
      const job = await getIdeaJob(ideaJobId);
      if (job.status === 'done') {
        setGenerating(false);
        loadPastIdeas();
        notifyIfBackgrounded(t('notify.ideasReadyTitle'), t('notify.ideasReadyBody'));
        navigation.navigate('IdeaResults', { ideaJobId });
        return;
      }
      if (job.status === 'failed') {
        setGenerating(false);
        loadPastIdeas();
        notifyIfBackgrounded(t('notify.ideasFailedTitle'), t('notify.ideasFailedBody'));
        Alert.alert(t('idea.generationFailed'), job.error ?? t('idea.somethingWrong'));
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }

  async function handleGenerate() {
    const trimmed = topic.trim();
    if (!trimmed) {
      Alert.alert(t('idea.missingTopicTitle'), t('idea.missingTopicBody'));
      return;
    }
    setGenerating(true);
    ensureNotificationPermission().catch(() => {});
    try {
      const { ideaJobId } = await generateIdeas(trimmed, mode, mode === 'contentPlan' ? days : undefined);
      clearTopicDraft();
      await pollUntilDone(ideaJobId);
    } catch (err) {
      setGenerating(false);
      Alert.alert(t('idea.startFailed'), err instanceof Error ? err.message : String(err));
    }
  }

  const activeMode = MODES.find((m) => m.key === mode)!;

  return (
    <View style={styles.container}>
      <SectionHeader
        eyebrow={t('idea.eyebrow')}
        title={t('idea.title')}
        highlight={t('idea.titleHighlight')}
        highlightColor={colors.accentAI}
        subtitle={t('idea.subtitle')}
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
            <Text style={[styles.modeChipText, mode === m.key && styles.modeChipTextActive]}>{t(m.labelKey)}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.modeDescription}>{t(activeMode.descriptionKey)}</Text>

      {mode === 'contentPlan' && (
        <View style={styles.dayRow}>
          <Text style={styles.dayLabel}>{t('idea.planLength')}</Text>
          {CONTENT_PLAN_DAY_OPTIONS.map((d) => (
            <TouchableOpacity
              key={d}
              onPress={() => setDays(d)}
              disabled={generating}
              style={[styles.dayChip, days === d && styles.dayChipActive]}
            >
              <Text style={[styles.dayChipText, days === d && styles.dayChipTextActive]}>{t('idea.days', { n: d })}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <Card style={styles.inputCard}>
        <TextInput
          style={styles.input}
          placeholder={t(activeMode.placeholderKey)}
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
        label={t(activeMode.buttonKey)}
        icon="sparkles"
        gradient={gradients.ai}
        onPress={handleGenerate}
        loading={generating}
        style={styles.generateButton}
      />

      <Text style={styles.sectionTitle}>{t('idea.pastIdeas')}</Text>
      {pastIdeas === null ? (
        <ActivityIndicator color={colors.accentAI} style={styles.pastLoading} />
      ) : pastIdeas.length === 0 ? (
        <EmptyState icon="bookmark" title={t('idea.noIdeasTitle')} body={t('idea.noIdeasBody')} />
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
                    <Text style={styles.modeBadgeText}>{t(MODE_BADGE_KEYS[item.mode])}</Text>
                  </View>
                </View>
                <View style={styles.cardFooter}>
                  <Text style={styles.cardMeta}>{formatDate(item.createdAt)}</Text>
                  <Text style={styles.cardMeta}>{t('idea.items', { n: item.ideaCount })}</Text>
                  <Text style={[styles.cardStatus, item.status === 'failed' && styles.cardStatusFailed]}>
                    {t(STATUS_KEYS[item.status])}
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
  modeDescription: { color: colors.textSecondary, fontSize: 12, lineHeight: 17, marginBottom: spacing.md },
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
