import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types';
import { uploadVideo } from '../api';
import Card from '../components/Card';
import IconBadge from '../components/IconBadge';
import GradientButton from '../components/GradientButton';
import SectionHeader from '../components/SectionHeader';
import { colors, spacing } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Upload'>;

type PickedVideo = {
  uri: string;
  fileName: string;
  durationMs: number | null;
  width: number;
  height: number;
};

const FEATURES: Array<{ icon: keyof typeof Ionicons.glyphMap; title: string; body: string; color: string }> = [
  { icon: 'flash-outline', title: 'AI Powered', body: 'Smart ideas that convert', color: colors.accentAI },
  { icon: 'ribbon-outline', title: 'Built for You', body: 'Your brand, your voice', color: colors.accentAI },
  { icon: 'trending-up-outline', title: 'High Impact', body: 'Designed to get more views', color: colors.accent },
  { icon: 'time-outline', title: 'Saves Time', body: 'Create more in less time', color: colors.accentAI },
];

export default function UploadScreen({ navigation }: Props) {
  const [picked, setPicked] = useState<PickedVideo | null>(null);
  const [uploading, setUploading] = useState(false);

  async function pickVideo() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Нужен доступ', 'Разрешите доступ к галерее, чтобы выбрать видео.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
    });

    if (result.canceled || result.assets.length === 0) return;

    const asset = result.assets[0];
    setPicked({
      uri: asset.uri,
      fileName: asset.fileName ?? 'video.mp4',
      durationMs: asset.duration ?? null,
      width: asset.width,
      height: asset.height,
    });
  }

  async function startProcessing() {
    if (!picked) return;
    setUploading(true);
    try {
      const { jobId } = await uploadVideo(picked.uri, picked.fileName);
      navigation.navigate('Processing', { jobId });
      setPicked(null);
    } catch (err) {
      Alert.alert('Ошибка загрузки', err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  }

  return (
    <View style={styles.container}>
      <SectionHeader
        eyebrow="New Reel"
        title="Create your first Reel"
        highlight="Reel"
        subtitle="Upload a video or get AI-powered ideas to create scroll-stopping content."
      />

      <TouchableOpacity onPress={pickVideo} disabled={uploading} activeOpacity={0.85}>
        <Card style={styles.actionCard}>
          <IconBadge icon="cloud-upload" color={colors.accent} />
          <View style={styles.actionText}>
            <Text style={styles.actionTitle}>Upload video</Text>
            <Text style={styles.actionSubtitle}>Select a video from your device</Text>
          </View>
          <Ionicons name="arrow-forward-circle-outline" size={26} color={colors.accent} />
        </Card>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => navigation.navigate('IdeaGenerator')}
        disabled={uploading}
        activeOpacity={0.85}
      >
        <Card style={styles.actionCard}>
          <IconBadge icon="sparkles" color={colors.accentAI} />
          <View style={styles.actionText}>
            <Text style={styles.actionTitle}>Or generate ideas from a topic</Text>
            <Text style={styles.actionSubtitle}>Tell AI your topic and get unique content ideas</Text>
          </View>
          <Ionicons name="arrow-forward-circle-outline" size={26} color={colors.accentAI} />
        </Card>
      </TouchableOpacity>

      <View style={styles.featureGrid}>
        {FEATURES.map((f) => (
          <View key={f.title} style={styles.featureTile}>
            <Ionicons name={f.icon} size={20} color={f.color} />
            <Text style={styles.featureTitle}>{f.title}</Text>
            <Text style={styles.featureBody}>{f.body}</Text>
          </View>
        ))}
      </View>

      {picked && (
        <Card style={styles.pickedCard}>
          <Text style={styles.cardLabel}>{picked.fileName}</Text>
          <View style={styles.metaRow}>
            {picked.durationMs != null && (
              <Text style={styles.cardMeta}>{(picked.durationMs / 1000).toFixed(0)}s</Text>
            )}
            <Text style={styles.cardMeta}>
              {picked.width}×{picked.height}
            </Text>
          </View>

          <GradientButton label="Start processing" onPress={startProcessing} loading={uploading} />
        </Card>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: spacing.lg, paddingTop: 70 },
  actionCard: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
  actionText: { flex: 1, marginHorizontal: spacing.md },
  actionTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: '600' },
  actionSubtitle: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  featureGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  featureTile: {
    flexBasis: '47%',
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  featureTitle: { color: colors.textPrimary, fontSize: 13, fontWeight: '600', marginTop: spacing.sm },
  featureBody: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  pickedCard: { marginTop: spacing.xs },
  cardLabel: { color: colors.textPrimary, fontSize: 14, fontWeight: '600', marginBottom: 8 },
  metaRow: { flexDirection: 'row', gap: 16, marginBottom: spacing.md },
  cardMeta: { color: colors.textSecondary, fontSize: 13 },
});
