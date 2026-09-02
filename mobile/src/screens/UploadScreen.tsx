import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types';
import { uploadVideo } from '../api';
import { colors, radius, spacing } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Upload'>;

type PickedVideo = {
  uri: string;
  fileName: string;
  durationMs: number | null;
  width: number;
  height: number;
};

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
      <View style={styles.headerRow}>
        <Text style={styles.eyebrow}>New Reel</Text>
        <Text style={styles.title}>Create your first Reel</Text>
      </View>

      <TouchableOpacity style={styles.uploadButton} onPress={pickVideo} disabled={uploading}>
        <Text style={styles.uploadButtonText}>Upload video</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => navigation.navigate('IdeaGenerator')} style={styles.ideaLink}>
        <Text style={styles.ideaLinkText}>Or generate ideas from a topic →</Text>
      </TouchableOpacity>

      {picked && (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>{picked.fileName}</Text>
          <View style={styles.metaRow}>
            {picked.durationMs != null && (
              <Text style={styles.cardMeta}>{(picked.durationMs / 1000).toFixed(0)}s</Text>
            )}
            <Text style={styles.cardMeta}>
              {picked.width}×{picked.height}
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.uploadButton, styles.primaryButton]}
            onPress={startProcessing}
            disabled={uploading}
          >
            {uploading ? (
              <ActivityIndicator color={colors.onAccent} />
            ) : (
              <Text style={styles.primaryButtonText}>Start processing</Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: spacing.lg, paddingTop: 80 },
  headerRow: { marginBottom: spacing.xl },
  eyebrow: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  title: { color: colors.textPrimary, fontSize: 24, fontWeight: '600' },
  uploadButton: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  primaryButton: { backgroundColor: colors.accent, borderColor: colors.accent },
  uploadButtonText: { color: colors.textPrimary, fontSize: 15, fontWeight: '600' },
  primaryButtonText: { color: colors.onAccent, fontSize: 15, fontWeight: '600' },
  ideaLink: { alignItems: 'center', marginBottom: spacing.md },
  ideaLinkText: { color: colors.accent, fontSize: 13, fontWeight: '600' },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginTop: spacing.xs,
  },
  cardLabel: { color: colors.textPrimary, fontSize: 14, fontWeight: '600', marginBottom: 8 },
  metaRow: { flexDirection: 'row', gap: 16, marginBottom: spacing.md },
  cardMeta: { color: colors.textSecondary, fontSize: 13 },
});
