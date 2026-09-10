import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Alert, ScrollView, Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type {
  Idea,
  ProfessionalScript,
  ContentPlanEntry,
  ShotList,
  TargetingBrief,
  IdeaJob,
  RootStackParamList,
} from '../types';
import { getIdeaJob } from '../api';
import { useI18n } from '../i18n/LanguageContext';
import type { TranslationKey } from '../i18n';
import Card from '../components/Card';
import LoadError from '../components/LoadError';
import { colors, radius, spacing } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'IdeaResults'>;
type T = (key: TranslationKey, params?: Record<string, string | number>) => string;

async function copyAndNotify(t: T, text: string, message: string) {
  await Clipboard.setStringAsync(text);
  Alert.alert(t('results.copiedTitle'), message);
}

function CopyButton({ onPress, label }: { onPress: () => void; label: string }) {
  return (
    <TouchableOpacity style={styles.copyButton} onPress={onPress} activeOpacity={0.85}>
      <Ionicons name="copy-outline" size={16} color={colors.accentAI} style={styles.copyIcon} />
      <Text style={styles.copyButtonText}>{label}</Text>
    </TouchableOpacity>
  );
}

function TopicsView({ ideas, t }: { ideas: Idea[]; t: T }) {
  return (
    <FlatList
      data={ideas}
      keyExtractor={(idea) => idea.id}
      renderItem={({ item, index }) => (
        <Card style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.numberBadge}>
              <Text style={styles.numberBadgeText}>{String(index + 1).padStart(2, '0')}</Text>
            </View>
            <Text style={styles.cardHook}>&ldquo;{item.hook}&rdquo;</Text>
          </View>
          <Text style={styles.bodyText}>{item.script}</Text>
          <Text style={styles.ctaText}>{t('results.ctaLabel')} {item.cta}</Text>
          <CopyButton
            label={t('results.copyScript')}
            onPress={() => copyAndNotify(t, `${item.hook}\n\n${item.script}\n\n${item.cta}`, t('results.scriptCopied'))}
          />
        </Card>
      )}
    />
  );
}

function ScriptView({ scripts, t }: { scripts: ProfessionalScript[]; t: T }) {
  return (
    <FlatList
      data={scripts}
      keyExtractor={(s) => s.id}
      renderItem={({ item, index }) => (
        <Card style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.numberBadge}>
              <Text style={styles.numberBadgeText}>{String(index + 1).padStart(2, '0')}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardHook}>{item.title}</Text>
              <Text style={styles.scriptAngle}>{item.angle}</Text>
            </View>
            <Text style={styles.durationBadge}>~{item.estimatedDurationSec}s</Text>
          </View>
          {item.sections.map((s, i) => (
            <View key={i} style={styles.sectionBlock}>
              <Text style={styles.sectionLabel}>{s.label}</Text>
              <Text style={styles.bodyText}>{s.script}</Text>
              {s.visualNotes && <Text style={styles.visualNotes}>🎥 {s.visualNotes}</Text>}
            </View>
          ))}
          <Text style={styles.ctaText}>{t('results.ctaLabel')} {item.cta}</Text>
          <CopyButton
            label={t('results.copyFullScript')}
            onPress={() =>
              copyAndNotify(
                t,
                `${item.title}\n\n${item.sections.map((s) => `[${s.label}]\n${s.script}`).join('\n\n')}\n\n${item.cta}`,
                t('results.fullScriptCopied'),
              )
            }
          />
        </Card>
      )}
    />
  );
}

function ContentPlanView({ entries, t }: { entries: ContentPlanEntry[]; t: T }) {
  const sorted = [...entries].sort((a, b) => a.day - b.day);
  return (
    <FlatList
      data={sorted}
      keyExtractor={(e) => e.id}
      renderItem={({ item }) => (
        <Card style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.numberBadge}>
              <Text style={styles.numberBadgeText}>{t('results.day', { n: item.day })}</Text>
            </View>
            <Text style={styles.formatBadge}>{item.format}</Text>
          </View>
          <Text style={styles.cardHook}>{item.title}</Text>
          <Text style={styles.bodyText}>{item.captionShort}</Text>
          <Text style={styles.hashtagsText}>{item.hashtags.map((h) => `#${h}`).join(' ')}</Text>
          <CopyButton
            label={t('results.copyCaption')}
            onPress={() =>
              copyAndNotify(t, `${item.captionShort}\n\n${item.hashtags.map((h) => `#${h}`).join(' ')}`, t('results.captionCopied'))
            }
          />
        </Card>
      )}
    />
  );
}

function ShotListView({ shotList, t }: { shotList: ShotList; t: T }) {
  return (
    <ScrollView>
      {shotList.items.map((item) => (
        <Card key={item.id} style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.numberBadge}>
              <Text style={styles.numberBadgeText}>{String(item.shotNumber).padStart(2, '0')}</Text>
            </View>
            <Text style={styles.cardHook}>{item.shotType}</Text>
            <Text style={styles.durationBadge}>~{item.durationEstimateSec}s</Text>
          </View>
          <Text style={styles.bodyText}>{item.description}</Text>
          {item.gearNotes && <Text style={styles.visualNotes}>📱 {item.gearNotes}</Text>}
        </Card>
      ))}
      {shotList.overallTips.length > 0 && (
        <Card style={styles.card}>
          <Text style={styles.sectionLabel}>{t('results.filmingTips')}</Text>
          {shotList.overallTips.map((tip, i) => (
            <View key={i} style={styles.tipRow}>
              <Ionicons name="checkmark-circle" size={14} color={colors.accentAI} />
              <Text style={styles.tipText}>{tip}</Text>
            </View>
          ))}
        </Card>
      )}
    </ScrollView>
  );
}

function TargetingView({ targeting, t }: { targeting: TargetingBrief; t: T }) {
  return (
    <ScrollView>
      <Text style={styles.groupTitle}>{t('results.audienceSegments')}</Text>
      {targeting.audienceSegments.map((seg) => (
        <Card key={seg.id} style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardHook}>{seg.name}</Text>
            <Text style={styles.durationBadge}>{seg.ageRange}</Text>
          </View>
          <Text style={styles.hashtagsText}>{seg.interests.join(' · ')}</Text>
          <Text style={styles.bodyText}>{seg.rationale}</Text>
        </Card>
      ))}
      <Text style={styles.groupTitle}>{t('results.adCopyVariants')}</Text>
      {targeting.adCopyVariants.map((ad) => (
        <Card key={ad.id} style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardHook}>{ad.headline}</Text>
            <Text style={styles.formatBadge}>{ad.cta}</Text>
          </View>
          <Text style={styles.bodyText}>{ad.primaryText}</Text>
          <CopyButton
            label={t('results.copy')}
            onPress={() => copyAndNotify(t, `${ad.headline}\n\n${ad.primaryText}\n\n[${ad.cta}]`, t('results.adCopyCopied'))}
          />
        </Card>
      ))}
    </ScrollView>
  );
}

// The whole result as one plain-text block, for "Copy all" / the OS share sheet — handy for
// pasting a full script or content plan into notes, a doc, or a message.
function buildFullText(job: IdeaJob): string {
  switch (job.mode) {
    case 'topics':
      return job.ideas
        .map((i, n) => `${n + 1}. ${i.hook}\n${i.script}\nCTA: ${i.cta}`)
        .join('\n\n');
    case 'script':
      return job.scripts
        .map(
          (s) =>
            `${s.title} (~${s.estimatedDurationSec}s)\n${s.angle}\n\n` +
            s.sections
              .map((sec) => `[${sec.label}]\n${sec.script}${sec.visualNotes ? `\n(${sec.visualNotes})` : ''}`)
              .join('\n\n') +
            `\n\nCTA: ${s.cta}`,
        )
        .join('\n\n———\n\n');
    case 'contentPlan':
      return [...job.contentPlan]
        .sort((a, b) => a.day - b.day)
        .map(
          (e) =>
            `Day ${e.day} — ${e.format}\n${e.title}\n${e.captionShort}\n${e.hashtags.map((h) => `#${h}`).join(' ')}`,
        )
        .join('\n\n');
    case 'shotList':
      if (!job.shotList) return '';
      return (
        job.shotList.items
          .map(
            (it) =>
              `${it.shotNumber}. ${it.shotType} (~${it.durationEstimateSec}s)\n${it.description}${it.gearNotes ? `\nGear: ${it.gearNotes}` : ''}`,
          )
          .join('\n\n') +
        (job.shotList.overallTips.length
          ? `\n\nTips:\n${job.shotList.overallTips.map((x) => `- ${x}`).join('\n')}`
          : '')
      );
    case 'targeting':
      if (!job.targeting) return '';
      return (
        'AUDIENCE SEGMENTS\n' +
        job.targeting.audienceSegments
          .map((s) => `${s.name} (${s.ageRange})\n${s.interests.join(', ')}\n${s.rationale}`)
          .join('\n\n') +
        '\n\nAD COPY\n' +
        job.targeting.adCopyVariants.map((a) => `${a.headline}\n${a.primaryText}\n[${a.cta}]`).join('\n\n')
      );
  }
}

function ResultActions({ text, t }: { text: string; t: T }) {
  if (!text) return null;
  return (
    <View style={styles.actionsRow}>
      <TouchableOpacity
        style={styles.actionChip}
        onPress={() => copyAndNotify(t, text, t('results.allCopied'))}
        activeOpacity={0.85}
      >
        <Ionicons name="copy-outline" size={15} color={colors.accentAI} />
        <Text style={styles.actionChipText}>{t('results.copyAll')}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.actionChip}
        onPress={() => Share.share({ message: text }).catch(() => {})}
        activeOpacity={0.85}
      >
        <Ionicons name="share-outline" size={15} color={colors.accentAI} />
        <Text style={styles.actionChipText}>{t('results.share')}</Text>
      </TouchableOpacity>
    </View>
  );
}

function titleFor(job: IdeaJob, t: T): string {
  switch (job.mode) {
    case 'topics':
      return t('results.ideasTitle', { n: job.ideas.length, topic: job.topic });
    case 'script':
      return t('results.scriptsTitle', { n: job.scripts.length, topic: job.topic });
    case 'contentPlan':
      return t('results.planTitle', { n: job.contentPlan.length, topic: job.topic });
    case 'shotList':
      return t('results.shotListTitle', { topic: job.topic });
    case 'targeting':
      return t('results.targetingTitle', { topic: job.topic });
  }
}

export default function IdeaResultsScreen({ route, navigation }: Props) {
  const { ideaJobId } = route.params;
  const { t } = useI18n();
  const [job, setJob] = useState<IdeaJob | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    setFailed(false);
    setJob(null);
    getIdeaJob(ideaJobId)
      .then(setJob)
      .catch(() => setFailed(true));
  }, [ideaJobId]);

  useEffect(() => {
    load();
  }, [load]);

  if (failed) return <LoadError onRetry={load} accent={colors.accentAI} />;

  if (!job) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accentAI} />
      </View>
    );
  }

  const hasContent =
    (job.mode === 'topics' && job.ideas.length > 0) ||
    (job.mode === 'script' && job.scripts.length > 0) ||
    (job.mode === 'contentPlan' && job.contentPlan.length > 0) ||
    (job.mode === 'shotList' && !!job.shotList && job.shotList.items.length > 0) ||
    (job.mode === 'targeting' && !!job.targeting && job.targeting.audienceSegments.length > 0);

  function generateAgain() {
    navigation.navigate('IdeaGenerator', {
      prefillTopic: job!.topic,
      prefillMode: job!.mode,
      prefillDays: job!.mode === 'contentPlan' ? job!.contentPlan.length : undefined,
    });
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{titleFor(job, t)}</Text>
      <TouchableOpacity style={styles.regenButton} onPress={generateAgain} activeOpacity={0.85}>
        <Ionicons name="refresh" size={15} color={colors.accentAI} />
        <Text style={styles.regenButtonText}>{t('results.generateAgain')}</Text>
      </TouchableOpacity>
      {hasContent ? (
        <>
          <ResultActions text={buildFullText(job)} t={t} />
          {job.mode === 'topics' && <TopicsView ideas={job.ideas} t={t} />}
          {job.mode === 'script' && <ScriptView scripts={job.scripts} t={t} />}
          {job.mode === 'contentPlan' && <ContentPlanView entries={job.contentPlan} t={t} />}
          {job.mode === 'shotList' && job.shotList && <ShotListView shotList={job.shotList} t={t} />}
          {job.mode === 'targeting' && job.targeting && <TargetingView targeting={job.targeting} t={t} />}
        </>
      ) : (
        <Text style={styles.emptyText}>{t('results.empty')}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: spacing.lg, paddingTop: 60 },
  center: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  title: { color: colors.textPrimary, fontSize: 20, fontWeight: '600', marginBottom: spacing.md },
  emptyText: { color: colors.textSecondary, fontSize: 14, marginTop: spacing.md },
  regenButton: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.accentAI,
    borderRadius: radius.md,
    paddingVertical: 8,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  regenButtonText: { color: colors.accentAI, fontSize: 12, fontWeight: '600' },
  actionsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  actionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: 8,
    paddingHorizontal: spacing.md,
  },
  actionChipText: { color: colors.accentAI, fontSize: 12, fontWeight: '600' },
  card: { marginBottom: spacing.sm },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  numberBadge: {
    backgroundColor: colors.accentSurface,
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  numberBadgeText: { color: colors.accentAI, fontSize: 12, fontWeight: '700' },
  cardHook: { color: colors.textPrimary, fontSize: 15, fontWeight: '600', flex: 1 },
  scriptAngle: { color: colors.textMuted, fontSize: 12, fontStyle: 'italic', marginTop: 2 },
  durationBadge: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
  formatBadge: { color: colors.accent, fontSize: 12, fontWeight: '700', backgroundColor: colors.accentSurface, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  bodyText: { color: colors.textSecondary, fontSize: 13, marginTop: spacing.sm, lineHeight: 19 },
  ctaText: { color: colors.accent, fontSize: 12, fontWeight: '600', marginTop: spacing.sm },
  hashtagsText: { color: colors.accentAI, fontSize: 12, marginTop: spacing.xs },
  sectionBlock: { marginTop: spacing.md, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  sectionLabel: { color: colors.textPrimary, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  visualNotes: { color: colors.textMuted, fontSize: 12, marginTop: spacing.xs, fontStyle: 'italic' },
  tipRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: spacing.xs },
  tipText: { flex: 1, color: colors.textSecondary, fontSize: 13, lineHeight: 18 },
  groupTitle: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  copyButton: {
    flexDirection: 'row',
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.accentAI,
    borderRadius: radius.md,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copyIcon: { marginRight: 6 },
  copyButtonText: { color: colors.accentAI, fontSize: 13, fontWeight: '600' },
});
