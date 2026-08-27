import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList, Language, Translation } from '../types';
import { clipFileUrl, getLanguages, translateClip } from '../api';

type Props = NativeStackScreenProps<RootStackParamList, 'Preview'>;

const ORIGINAL_KEY = '__original__';

export default function PreviewScreen({ route }: Props) {
  const { clip } = route.params;
  const [exporting, setExporting] = useState(false);
  const [languages, setLanguages] = useState<Language[]>([]);
  const [translations, setTranslations] = useState<Translation[]>(clip.translations ?? []);
  const [translatingLang, setTranslatingLang] = useState<string | null>(null);
  const [activeKey, setActiveKey] = useState<string>(ORIGINAL_KEY);

  useEffect(() => {
    getLanguages().then(setLanguages).catch(() => {});
  }, []);

  const activeTranslation = translations.find((t) => t.language === activeKey);
  const activeFile = activeKey === ORIGINAL_KEY ? clip.outputFile : activeTranslation?.outputFile;
  const activeHook = activeKey === ORIGINAL_KEY ? clip.chosenHook : activeTranslation?.hook || clip.chosenHook;

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
      setActiveKey(language);
    } catch (err) {
      Alert.alert('Translation failed', err instanceof Error ? err.message : String(err));
    } finally {
      setTranslatingLang(null);
    }
  }

  async function handleExport() {
    if (!videoUrl) return;
    setExporting(true);
    try {
      const destination = new Directory(Paths.cache);
      destination.create({ idempotent: true });
      const file = await File.downloadFileAsync(videoUrl, destination, { idempotent: true });

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(file.uri);
      } else {
        Alert.alert('Saved', `Clip saved to ${file.uri}`);
      }
    } catch (err) {
      Alert.alert('Export failed', err instanceof Error ? err.message : String(err));
    } finally {
      setExporting(false);
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

      <View style={styles.languageRow}>
        <TouchableOpacity
          style={[styles.languageChip, activeKey === ORIGINAL_KEY && styles.languageChipActive]}
          onPress={() => setActiveKey(ORIGINAL_KEY)}
        >
          <Text style={[styles.languageChipText, activeKey === ORIGINAL_KEY && styles.languageChipTextActive]}>
            Original
          </Text>
        </TouchableOpacity>
        {languages
          .filter((l) => l.code !== 'en')
          .map((lang) => {
            const existing = translations.find((t) => t.language === lang.code);
            const isActive = activeKey === lang.code;
            const isLoading = translatingLang === lang.code;
            return (
              <TouchableOpacity
                key={lang.code}
                style={[styles.languageChip, isActive && styles.languageChipActive]}
                disabled={isLoading}
                onPress={() => (existing ? setActiveKey(lang.code) : handleTranslate(lang.code))}
              >
                {isLoading ? (
                  <ActivityIndicator size="small" color="#6C5CE7" />
                ) : (
                  <Text style={[styles.languageChipText, isActive && styles.languageChipTextActive]}>
                    {lang.label}
                  </Text>
                )}
              </TouchableOpacity>
            );
          })}
      </View>

      <View style={styles.scoreCard}>
        <Text style={styles.scoreTotal}>VIRAL SCORE {clip.score}/100</Text>
        {scores.map(([label, value]) => (
          <View key={label} style={styles.scoreRow}>
            <Text style={styles.scoreLabel}>{label}</Text>
            <Text style={styles.scoreValue}>{value}</Text>
          </View>
        ))}
      </View>

      <TouchableOpacity style={styles.exportButton} onPress={handleExport} disabled={exporting}>
        {exporting ? <ActivityIndicator color="#fff" /> : <Text style={styles.exportButtonText}>Export / Share</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0B0F', padding: 20 },
  video: { width: '100%', aspectRatio: 9 / 16, borderRadius: 16, backgroundColor: '#000', marginTop: 20 },
  topic: { color: '#fff', fontSize: 18, fontWeight: '700', marginTop: 16 },
  hook: { color: '#B8B8C2', fontSize: 14, fontStyle: 'italic', marginTop: 6, marginBottom: 16 },
  languageRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  languageChip: {
    backgroundColor: '#16161D',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
    minWidth: 44,
    alignItems: 'center',
  },
  languageChipActive: { backgroundColor: '#6C5CE7' },
  languageChipText: { color: '#B8B8C2', fontSize: 13, fontWeight: '600' },
  languageChipTextActive: { color: '#fff' },
  scoreCard: { backgroundColor: '#16161D', borderRadius: 14, padding: 16 },
  scoreTotal: { color: '#6C5CE7', fontSize: 16, fontWeight: '800', marginBottom: 10 },
  scoreRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  scoreLabel: { color: '#B8B8C2', fontSize: 14 },
  scoreValue: { color: '#fff', fontSize: 14, fontWeight: '600' },
  exportButton: {
    backgroundColor: '#6C5CE7',
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
    marginTop: 20,
  },
  exportButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
