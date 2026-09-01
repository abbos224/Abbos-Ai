import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, ScrollView, Image, Linking } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList, Language, RegenerateModifier, Regeneration, Translation, YoutubeStatus } from '../types';
import {
  clipFileUrl,
  disconnectYoutube,
  getLanguages,
  getRegenerateModifiers,
  getYoutubeStatus,
  publishToYoutube,
  regenerateClip,
  scheduleClip,
  translateClip,
  youtubeConnectUrl,
} from '../api';
import { colors, radius, spacing } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Preview'>;

const ORIGINAL_KEY = '__original__';

function addDaysIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatScheduledDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export default function PreviewScreen({ route }: Props) {
  const { clip } = route.params;
  const [exporting, setExporting] = useState(false);
  const [languages, setLanguages] = useState<Language[]>([]);
  const [translations, setTranslations] = useState<Translation[]>(clip.translations ?? []);
  const [translatingLang, setTranslatingLang] = useState<string | null>(null);
  const [activeKey, setActiveKey] = useState<string>(ORIGINAL_KEY);
  const [scheduledFor, setScheduledFor] = useState<string | undefined>(clip.scheduledFor);
  const [scheduling, setScheduling] = useState(false);
  const [captionLength, setCaptionLength] = useState<'short' | 'medium' | 'long'>('medium');
  const [youtubeStatus, setYoutubeStatus] = useState<YoutubeStatus | null>(null);
  const [publishedUrl, setPublishedUrl] = useState<string | undefined>(clip.publishedYoutubeUrl);
  const [publishing, setPublishing] = useState(false);
  const [modifiers, setModifiers] = useState<Array<{ modifier: RegenerateModifier; label: string }>>([]);
  const [regenerations, setRegenerations] = useState<Regeneration[]>(clip.regenerations ?? []);
  const [regeneratingModifier, setRegeneratingModifier] = useState<RegenerateModifier | null>(null);
  const [activeVariant, setActiveVariant] = useState<'original' | RegenerateModifier>('original');

  useEffect(() => {
    getLanguages().then(setLanguages).catch(() => {});
    getRegenerateModifiers().then(setModifiers).catch(() => {});
  }, []);

  // Re-check connection status whenever this screen regains focus — the user connects YouTube in
  // an external browser (Google disallows in-app WebView OAuth), so we won't hear back any other way.
  useFocusEffect(
    useCallback(() => {
      getYoutubeStatus().then(setYoutubeStatus).catch(() => {});
    }, [])
  );

  const activeRegeneration =
    activeVariant !== 'original' ? regenerations.find((r) => r.modifier === activeVariant) : undefined;
  const activeTranslation = translations.find((t) => t.language === activeKey);
  const activeFile = activeRegeneration
    ? activeRegeneration.outputFile
    : activeKey === ORIGINAL_KEY
      ? clip.outputFile
      : activeTranslation?.outputFile;
  const activeHook = activeRegeneration
    ? activeRegeneration.chosenHook
    : activeKey === ORIGINAL_KEY
      ? clip.chosenHook
      : activeTranslation?.hook || clip.chosenHook;
  const activeCta = activeRegeneration ? activeRegeneration.cta : clip.cta;
  const activeCoverOptions = activeRegeneration?.coverOptions ?? clip.coverOptions;
  const activeCoverImages = activeRegeneration?.coverImages ?? clip.coverImages;
  const activeSocialCaption = activeRegeneration?.socialCaption ?? clip.socialCaption;

  const videoUrl = activeFile ? clipFileUrl(activeFile) : undefined;
  const player = useVideoPlayer(videoUrl ?? null, (p) => {
    p.loop = true;
    p.play();
  });

  useEffect(() => {
    if (videoUrl) player.replaceAsync(videoUrl).then(() => player.play());
  }, [videoUrl]);

  async function handleTranslate(language: string) {
    setTranslatingLang(language);
    try {
      const translation = await translateClip(clip.jobId, clip.id, language);
      setTranslations((prev) => [...prev.filter((t) => t.language !== language), translation]);
      setActiveVariant('original');
      setActiveKey(language);
    } catch (err) {
      Alert.alert('Translation failed', err instanceof Error ? err.message : String(err));
    } finally {
      setTranslatingLang(null);
    }
  }

  function selectLanguage(key: string) {
    setActiveVariant('original');
    setActiveKey(key);
  }

  async function handleRegenerate(modifier: RegenerateModifier) {
    setRegeneratingModifier(modifier);
    try {
      const regeneration = await regenerateClip(clip.jobId, clip.id, modifier);
      setRegenerations((prev) => [...prev.filter((r) => r.modifier !== modifier), regeneration]);
      setActiveKey(ORIGINAL_KEY);
      setActiveVariant(modifier);
    } catch (err) {
      Alert.alert('Regenerate failed', err instanceof Error ? err.message : String(err));
    } finally {
      setRegeneratingModifier(null);
    }
  }

  async function shareRemoteFile(url: string) {
    const destination = new Directory(Paths.cache);
    destination.create({ idempotent: true });
    const file = await File.downloadFileAsync(url, destination, { idempotent: true });

    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(file.uri);
    } else {
      Alert.alert('Saved', `File saved to ${file.uri}`);
    }
  }

  async function handleSchedule(date: string | null) {
    setScheduling(true);
    try {
      await scheduleClip(clip.jobId, clip.id, date);
      setScheduledFor(date ?? undefined);
    } catch (err) {
      Alert.alert('Scheduling failed', err instanceof Error ? err.message : String(err));
    } finally {
      setScheduling(false);
    }
  }

  async function handleConnectYoutube() {
    await Linking.openURL(youtubeConnectUrl());
  }

  async function handleDisconnectYoutube() {
    try {
      await disconnectYoutube();
      setYoutubeStatus((prev) => (prev ? { ...prev, connected: false, channelTitle: undefined } : prev));
    } catch (err) {
      Alert.alert('Failed to disconnect', err instanceof Error ? err.message : String(err));
    }
  }

  function handlePublish() {
    Alert.alert(
      'Publish to YouTube',
      `Upload this clip to ${youtubeStatus?.channelTitle ?? 'your channel'} as a private video? You can make it public later from YouTube Studio.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Publish',
          onPress: async () => {
            setPublishing(true);
            try {
              const { url } = await publishToYoutube(clip.jobId, clip.id, {
                title: clip.chosenHook,
                description: clip.cta,
                privacyStatus: 'private',
              });
              setPublishedUrl(url);
            } catch (err) {
              Alert.alert('Publish failed', err instanceof Error ? err.message : String(err));
            } finally {
              setPublishing(false);
            }
          },
        },
      ]
    );
  }

  async function handleExport() {
    if (!videoUrl) return;
    setExporting(true);
    try {
      await shareRemoteFile(videoUrl);
    } catch (err) {
      Alert.alert('Export failed', err instanceof Error ? err.message : String(err));
    } finally {
      setExporting(false);
    }
  }

  async function handleCopyCaption() {
    if (!activeSocialCaption) return;
    const text = `${activeSocialCaption[captionLength]}\n\n${activeSocialCaption.hashtags.map((h) => `#${h}`).join(' ')}`;
    await Clipboard.setStringAsync(text);
    Alert.alert('Copied', 'Caption + hashtags copied — paste it when posting to Instagram or TikTok.');
  }

  async function handleExportCover(coverUrl: string) {
    try {
      await shareRemoteFile(clipFileUrl(coverUrl));
    } catch (err) {
      Alert.alert('Export failed', err instanceof Error ? err.message : String(err));
    }
  }

  const scores: Array<[string, number]> = [
    ['Hook', clip.scoreBreakdown.hook],
    ['Retention', clip.scoreBreakdown.retention],
    ['Emotion', clip.scoreBreakdown.emotion],
    ['Clarity', clip.scoreBreakdown.clarity],
    ['Shareability', clip.scoreBreakdown.shareability],
    ['CTA', clip.scoreBreakdown.cta],
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      {videoUrl && <VideoView player={player} style={styles.video} contentFit="contain" />}

      <Text style={styles.topic}>{clip.topic}</Text>
      <Text style={styles.hook}>&ldquo;{activeHook}&rdquo;</Text>
      {activeCta && (
        <View style={styles.ctaRow}>
          <Text style={styles.ctaLabel}>CTA</Text>
          <Text style={styles.ctaText}>{activeCta}</Text>
        </View>
      )}

      {activeCoverImages && activeCoverImages.length > 0 && (
        <>
          <Text style={styles.sectionLabel}>Cover</Text>
          <View style={styles.coverRow}>
            {activeCoverImages.map((cover, i) => (
              <TouchableOpacity key={cover} onPress={() => handleExportCover(cover)}>
                <Image source={{ uri: clipFileUrl(cover) }} style={styles.coverThumb} />
                <Text style={styles.coverCaption} numberOfLines={1}>
                  {activeCoverOptions[i]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      {activeSocialCaption && (
        <View style={styles.captionCard}>
          <View style={styles.scoreHeader}>
            <Text style={styles.scoreLabel}>Post caption</Text>
          </View>

          <View style={styles.lengthRow}>
            {(['short', 'medium', 'long'] as const).map((len) => (
              <TouchableOpacity
                key={len}
                style={[styles.lengthChip, captionLength === len && styles.lengthChipActive]}
                onPress={() => setCaptionLength(len)}
              >
                <Text style={[styles.lengthChipText, captionLength === len && styles.lengthChipTextActive]}>
                  {len[0].toUpperCase() + len.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.captionText}>{activeSocialCaption[captionLength]}</Text>

          <View style={styles.hashtagRow}>
            {activeSocialCaption.hashtags.map((tag) => (
              <Text key={tag} style={styles.hashtag}>
                #{tag}
              </Text>
            ))}
          </View>

          <TouchableOpacity style={styles.copyButton} onPress={handleCopyCaption}>
            <Text style={styles.copyButtonText}>Copy caption + hashtags</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.languageRow}>
        <TouchableOpacity
          style={[styles.languageChip, activeKey === ORIGINAL_KEY && activeVariant === 'original' && styles.languageChipActive]}
          onPress={() => selectLanguage(ORIGINAL_KEY)}
        >
          <Text
            style={[
              styles.languageChipText,
              activeKey === ORIGINAL_KEY && activeVariant === 'original' && styles.languageChipTextActive,
            ]}
          >
            Original
          </Text>
        </TouchableOpacity>
        {languages
          .filter((l) => l.code !== 'en')
          .map((lang) => {
            const existing = translations.find((t) => t.language === lang.code);
            const isActive = activeKey === lang.code && activeVariant === 'original';
            const isLoading = translatingLang === lang.code;
            return (
              <TouchableOpacity
                key={lang.code}
                style={[styles.languageChip, isActive && styles.languageChipActive]}
                disabled={isLoading}
                onPress={() => (existing ? selectLanguage(lang.code) : handleTranslate(lang.code))}
              >
                {isLoading ? (
                  <ActivityIndicator size="small" color={colors.accent} />
                ) : (
                  <Text style={[styles.languageChipText, isActive && styles.languageChipTextActive]}>
                    {lang.label}
                  </Text>
                )}
              </TouchableOpacity>
            );
          })}
      </View>

      {regenerations.length > 0 && (
        <View style={styles.languageRow}>
          <TouchableOpacity
            style={[styles.languageChip, activeVariant === 'original' && styles.languageChipActive]}
            onPress={() => setActiveVariant('original')}
          >
            <Text style={[styles.languageChipText, activeVariant === 'original' && styles.languageChipTextActive]}>
              Original
            </Text>
          </TouchableOpacity>
          {regenerations
            .filter((r) => r.status === 'done')
            .map((r) => {
              const isActive = activeVariant === r.modifier;
              return (
                <TouchableOpacity
                  key={r.modifier}
                  style={[styles.languageChip, isActive && styles.languageChipActive]}
                  onPress={() => setActiveVariant(r.modifier)}
                >
                  <Text style={[styles.languageChipText, isActive && styles.languageChipTextActive]}>
                    {r.modifierLabel}
                  </Text>
                </TouchableOpacity>
              );
            })}
        </View>
      )}

      <View style={styles.scheduleCard}>
        <View style={styles.scoreHeader}>
          <Text style={styles.scoreLabel}>Regenerate</Text>
        </View>
        <Text style={styles.regenerateHint}>
          Rewrite the hook, CTA, cover, and caption in a new voice — re-renders this clip as a new variant.
        </Text>
        <View style={styles.scheduleRow}>
          {modifiers.map((m) => (
            <TouchableOpacity
              key={m.modifier}
              style={styles.scheduleChip}
              disabled={regeneratingModifier !== null}
              onPress={() => handleRegenerate(m.modifier)}
            >
              {regeneratingModifier === m.modifier ? (
                <ActivityIndicator size="small" color={colors.accent} />
              ) : (
                <Text style={styles.scheduleChipText}>{m.label}</Text>
              )}
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.scoreCard}>
        <View style={styles.scoreHeader}>
          <Text style={styles.scoreLabel}>Viral score</Text>
          <Text style={styles.scoreTotal}>{clip.score}/100</Text>
        </View>
        {scores.map(([label, value]) => (
          <View key={label} style={styles.scoreRow}>
            <Text style={styles.scoreRowLabel}>{label}</Text>
            <Text style={styles.scoreRowValue}>{value}</Text>
          </View>
        ))}
      </View>

      <View style={styles.scheduleCard}>
        <View style={styles.scoreHeader}>
          <Text style={styles.scoreLabel}>Schedule</Text>
          <Text style={styles.scheduleCurrent}>
            {scheduledFor ? formatScheduledDate(scheduledFor) : 'Not scheduled'}
          </Text>
        </View>
        <View style={styles.scheduleRow}>
          {[
            { label: 'Tomorrow', date: addDaysIso(1) },
            { label: '+3 days', date: addDaysIso(3) },
            { label: '+1 week', date: addDaysIso(7) },
          ].map((opt) => (
            <TouchableOpacity
              key={opt.label}
              style={styles.scheduleChip}
              disabled={scheduling}
              onPress={() => handleSchedule(opt.date)}
            >
              <Text style={styles.scheduleChipText}>{opt.label}</Text>
            </TouchableOpacity>
          ))}
          {scheduledFor && (
            <TouchableOpacity style={styles.scheduleChip} disabled={scheduling} onPress={() => handleSchedule(null)}>
              <Text style={styles.scheduleChipText}>Clear</Text>
            </TouchableOpacity>
          )}
          {scheduling && <ActivityIndicator size="small" color={colors.accent} />}
        </View>
      </View>

      {youtubeStatus?.configured && (
        <View style={styles.scheduleCard}>
          <View style={styles.scoreHeader}>
            <Text style={styles.scoreLabel}>YouTube</Text>
            {youtubeStatus.connected && (
              <Text style={styles.scheduleCurrent} numberOfLines={1}>
                {youtubeStatus.channelTitle ?? 'Connected'}
              </Text>
            )}
          </View>

          {!youtubeStatus.connected ? (
            <TouchableOpacity style={styles.scheduleChip} onPress={handleConnectYoutube}>
              <Text style={styles.scheduleChipText}>Connect YouTube</Text>
            </TouchableOpacity>
          ) : publishedUrl ? (
            <TouchableOpacity onPress={() => Linking.openURL(publishedUrl)}>
              <Text style={styles.publishedLink} numberOfLines={1}>
                Published — view on YouTube ↗
              </Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.scheduleRow}>
              <TouchableOpacity style={styles.scheduleChip} disabled={publishing} onPress={handlePublish}>
                {publishing ? (
                  <ActivityIndicator size="small" color={colors.accent} />
                ) : (
                  <Text style={styles.scheduleChipText}>Publish (private)</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity onPress={handleDisconnectYoutube}>
                <Text style={styles.disconnectLink}>Disconnect</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      <TouchableOpacity style={styles.exportButton} onPress={handleExport} disabled={exporting}>
        {exporting ? (
          <ActivityIndicator color={colors.surface} />
        ) : (
          <Text style={styles.exportButtonText}>Export / Share</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: spacing.lg },
  video: { width: '100%', aspectRatio: 9 / 16, borderRadius: radius.lg, backgroundColor: '#000', marginTop: spacing.md },
  topic: { color: colors.textPrimary, fontSize: 17, fontWeight: '600', marginTop: spacing.md },
  hook: { color: colors.textSecondary, fontSize: 14, fontStyle: 'italic', marginTop: 6 },
  ctaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, marginBottom: spacing.md },
  ctaLabel: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    backgroundColor: colors.accentSurface,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  ctaText: { color: colors.textPrimary, fontSize: 13, fontWeight: '600', flex: 1 },
  sectionLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: spacing.sm,
  },
  coverRow: { flexDirection: 'row', gap: 10, marginBottom: spacing.md },
  coverThumb: {
    width: 84,
    aspectRatio: 9 / 16,
    borderRadius: radius.sm,
    backgroundColor: '#000',
    borderWidth: 1,
    borderColor: colors.border,
  },
  coverCaption: { color: colors.textSecondary, fontSize: 10, marginTop: 4, width: 84 },
  captionCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  lengthRow: { flexDirection: 'row', gap: 8, marginBottom: spacing.sm },
  lengthChip: {
    backgroundColor: colors.accentSurface,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  lengthChipActive: { backgroundColor: colors.accent },
  lengthChipText: { color: colors.accent, fontSize: 12, fontWeight: '600' },
  lengthChipTextActive: { color: colors.surface },
  captionText: { color: colors.textPrimary, fontSize: 14, lineHeight: 20 },
  hashtagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing.sm },
  hashtag: { color: colors.accent, fontSize: 13 },
  copyButton: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  copyButtonText: { color: colors.textPrimary, fontSize: 13, fontWeight: '600' },
  languageRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: spacing.md },
  languageChip: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
    minWidth: 44,
    alignItems: 'center',
  },
  languageChipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  languageChipText: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
  languageChipTextActive: { color: colors.surface },
  scoreCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  scoreHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  scoreLabel: { color: colors.textSecondary, fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },
  scoreTotal: { color: colors.accent, fontSize: 20, fontWeight: '700' },
  scoreRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
  scoreRowLabel: { color: colors.textSecondary, fontSize: 14 },
  scoreRowValue: { color: colors.textPrimary, fontSize: 14, fontWeight: '600' },
  scheduleCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  scheduleCurrent: { color: colors.accent, fontSize: 13, fontWeight: '600' },
  regenerateHint: { color: colors.textSecondary, fontSize: 12, marginBottom: spacing.sm, lineHeight: 17 },
  scheduleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  scheduleChip: {
    backgroundColor: colors.accentSurface,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  scheduleChipText: { color: colors.accent, fontSize: 13, fontWeight: '600' },
  publishedLink: { color: colors.accent, fontSize: 13, fontWeight: '600' },
  disconnectLink: { color: colors.textMuted, fontSize: 12, marginLeft: spacing.sm, alignSelf: 'center' },
  exportButton: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  exportButtonText: { color: colors.surface, fontSize: 15, fontWeight: '600' },
});
