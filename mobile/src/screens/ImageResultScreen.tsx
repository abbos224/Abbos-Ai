import React, { useEffect, useState } from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { ImageJob, RootStackParamList } from '../types';
import { clipFileUrl, getImageJob } from '../api';
import { saveRemoteFileToLibrary, shareRemoteFile } from '../utils/shareRemoteFile';
import GradientButton from '../components/GradientButton';
import { colors, gradients, radius, spacing } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'ImageResult'>;

export default function ImageResultScreen({ route, navigation }: Props) {
  const { imageJobId } = route.params;
  const [job, setJob] = useState<ImageJob | null>(null);
  const [saving, setSaving] = useState(false);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    getImageJob(imageJobId)
      .then(setJob)
      .catch((err) => Alert.alert('Failed to load image', err instanceof Error ? err.message : String(err)));
  }, [imageJobId]);

  async function handleSave() {
    if (!job?.outputFile) return;
    setSaving(true);
    try {
      await saveRemoteFileToLibrary(clipFileUrl(job.outputFile));
      Alert.alert('Saved', 'Image saved to your photo library.');
    } catch (err) {
      Alert.alert('Save failed', err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleShare() {
    if (!job?.outputFile) return;
    setSharing(true);
    try {
      await shareRemoteFile(clipFileUrl(job.outputFile));
    } catch (err) {
      Alert.alert('Share failed', err instanceof Error ? err.message : String(err));
    } finally {
      setSharing(false);
    }
  }

  if (!job || !job.outputFile) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accentAI} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Image source={{ uri: clipFileUrl(job.outputFile) }} style={styles.image} resizeMode="contain" />
      <Text style={styles.prompt} numberOfLines={3}>
        &ldquo;{job.prompt}&rdquo;
      </Text>

      <View style={styles.actionRow}>
        <TouchableOpacity style={styles.actionButton} onPress={handleSave} disabled={saving} activeOpacity={0.85}>
          {saving ? (
            <ActivityIndicator color={colors.accentAI} size="small" />
          ) : (
            <>
              <Ionicons name="download-outline" size={18} color={colors.accentAI} style={styles.actionIcon} />
              <Text style={styles.actionButtonText}>Save</Text>
            </>
          )}
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton} onPress={handleShare} disabled={sharing} activeOpacity={0.85}>
          {sharing ? (
            <ActivityIndicator color={colors.accentAI} size="small" />
          ) : (
            <>
              <Ionicons name="share-outline" size={18} color={colors.accentAI} style={styles.actionIcon} />
              <Text style={styles.actionButtonText}>Share</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      <GradientButton
        label="Continue editing"
        icon="color-wand"
        gradient={gradients.ai}
        onPress={() => navigation.navigate('ImageGenerator', { continueFromJobId: job.id })}
        style={styles.continueButton}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: spacing.lg, paddingTop: 60 },
  center: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  image: { width: '100%', aspectRatio: 1, borderRadius: radius.lg, backgroundColor: colors.surface },
  prompt: {
    color: colors.textSecondary,
    fontSize: 14,
    fontStyle: 'italic',
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  actionRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: colors.accentAI,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionIcon: { marginRight: spacing.xs },
  actionButtonText: { color: colors.accentAI, fontSize: 14, fontWeight: '600' },
  continueButton: { marginTop: spacing.sm },
});
