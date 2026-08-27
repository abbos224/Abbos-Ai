import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types';
import { clipFileUrl } from '../api';
import { colors, radius, spacing } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Preview'>;

export default function PreviewScreen({ route }: Props) {
  const { clip } = route.params;
  const [exporting, setExporting] = useState(false);

  const videoUrl = clip.outputFile ? clipFileUrl(clip.outputFile) : undefined;
  const player = useVideoPlayer(videoUrl ?? null, (p) => {
    p.loop = true;
    p.play();
  });

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
      <Text style={styles.hook}>&ldquo;{clip.chosenHook}&rdquo;</Text>

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
  hook: { color: colors.textSecondary, fontSize: 14, fontStyle: 'italic', marginTop: 6, marginBottom: spacing.md },
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
  exportButton: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  exportButtonText: { color: colors.surface, fontSize: 15, fontWeight: '600' },
});
