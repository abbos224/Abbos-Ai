import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types';
import { uploadVideo } from '../api';
import { useI18n } from '../i18n/LanguageContext';
import Card from '../components/Card';
import IconBadge from '../components/IconBadge';
import GradientButton from '../components/GradientButton';
import SectionHeader from '../components/SectionHeader';
import ChannelHomeCard from '../components/ChannelHomeCard';
import ToolsGrid from '../components/ToolsGrid';
import { colors, spacing } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Upload'>;

type PickedVideo = {
  uri: string;
  fileName: string;
  durationMs: number | null;
  width: number;
  height: number;
};

export default function UploadScreen({ navigation }: Props) {
  const { t } = useI18n();
  const [picked, setPicked] = useState<PickedVideo | null>(null);
  const [uploading, setUploading] = useState(false);

  async function pickVideo() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(t('upload.permissionTitle'), t('upload.permissionBody'));
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
      Alert.alert(t('upload.uploadFailedTitle'), err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <ChannelHomeCard />

      <SectionHeader
        eyebrow={t('upload.eyebrow')}
        title={t('upload.title')}
        subtitle={t('upload.subtitle')}
      />

      <TouchableOpacity onPress={pickVideo} disabled={uploading} activeOpacity={0.85}>
        <Card style={styles.actionCard}>
          <IconBadge icon="cloud-upload" color={colors.accent} />
          <View style={styles.actionText}>
            <Text style={styles.actionTitle}>{t('upload.uploadVideo')}</Text>
            <Text style={styles.actionSubtitle}>{t('upload.uploadVideoSub')}</Text>
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
            <Text style={styles.actionTitle}>{t('upload.generateIdeas')}</Text>
            <Text style={styles.actionSubtitle}>{t('upload.generateIdeasSub')}</Text>
          </View>
          <Ionicons name="arrow-forward-circle-outline" size={26} color={colors.accentAI} />
        </Card>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => navigation.navigate('ImageGenerator')}
        disabled={uploading}
        activeOpacity={0.85}
      >
        <Card style={styles.actionCard}>
          <IconBadge icon="image" color={colors.accentAI} />
          <View style={styles.actionText}>
            <Text style={styles.actionTitle}>{t('upload.generateImage')}</Text>
            <Text style={styles.actionSubtitle}>{t('upload.generateImageSub')}</Text>
          </View>
          <Ionicons name="arrow-forward-circle-outline" size={26} color={colors.accentAI} />
        </Card>
      </TouchableOpacity>

      <ToolsGrid navigation={navigation} />

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

          <GradientButton label={t('upload.startProcessing')} onPress={startProcessing} loading={uploading} />
        </Card>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingTop: 70, paddingBottom: spacing.xl },
  actionCard: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
  actionText: { flex: 1, marginHorizontal: spacing.md },
  actionTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: '600' },
  actionSubtitle: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  pickedCard: { marginTop: spacing.xs },
  cardLabel: { color: colors.textPrimary, fontSize: 14, fontWeight: '600', marginBottom: 8 },
  metaRow: { flexDirection: 'row', gap: 16, marginBottom: spacing.md },
  cardMeta: { color: colors.textSecondary, fontSize: 13 },
});
