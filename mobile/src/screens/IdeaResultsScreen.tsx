import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Alert, ScrollView } from 'react-native';
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

export default function IdeaResultsScreen({ route }: Props) {
  const { ideaJobId } = route.params;
  const { t } = useI18n();
  const [job, setJob] = useState<IdeaJob | null>(null);

  useEffect(() => {
    getIdeaJob(ideaJobId).then(setJob);
  }, [ideaJobId]);

  if (!job) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accentAI} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{titleFor(job, t)}</Text>
      {job.mode === 'topics' && <TopicsView ideas={job.ideas} t={t} />}
      {job.mode === 'script' && <ScriptView scripts={job.scripts} t={t} />}
      {job.mode === 'contentPlan' && <ContentPlanView entries={job.contentPlan} t={t} />}
      {job.mode === 'shotList' && job.shotList && <ShotListView shotList={job.shotList} t={t} />}
      {job.mode === 'targeting' && job.targeting && <TargetingView targeting={job.targeting} t={t} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: spacing.lg, paddingTop: 60 },
  center: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.textPrimary, fontSize: 20, fontWeight: '600', marginBottom: spacing.md },
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
