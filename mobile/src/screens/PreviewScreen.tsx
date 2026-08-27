import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types';
import { clipFileUrl } from '../api';

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
