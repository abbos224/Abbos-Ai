import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types';
import { uploadVideo } from '../api';

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
      <Text style={styles.title}>Create your first Reel</Text>

      <TouchableOpacity style={styles.uploadButton} onPress={pickVideo} disabled={uploading}>
        <Text style={styles.uploadButtonText}>+ Upload Video</Text>
      </TouchableOpacity>

      {picked && (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Video: {picked.fileName}</Text>
          {picked.durationMs != null && (
            <Text style={styles.cardLabel}>
              Duration: {(picked.durationMs / 1000).toFixed(0)}s
            </Text>
          )}
          <Text style={styles.cardLabel}>
            Resolution: {picked.width}x{picked.height}
          </Text>

          <TouchableOpacity
            style={[styles.uploadButton, styles.primaryButton]}
            onPress={startProcessing}
            disabled={uploading}
          >
            {uploading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.uploadButtonText}>Start Processing</Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0B0F', padding: 24, paddingTop: 80 },
  title: { color: '#fff', fontSize: 26, fontWeight: '700', marginBottom: 32 },
  uploadButton: {
    backgroundColor: '#1F1F27',
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
    marginBottom: 16,
  },
  primaryButton: { backgroundColor: '#6C5CE7' },
  uploadButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  card: {
    backgroundColor: '#16161D',
    borderRadius: 14,
    padding: 18,
    marginTop: 8,
  },
  cardLabel: { color: '#B8B8C2', fontSize: 14, marginBottom: 6 },
});
