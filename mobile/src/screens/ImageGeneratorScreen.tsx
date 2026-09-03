import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Image, StyleSheet, ActivityIndicator, Alert, FlatList } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { ImageJobSummary, ImageQuota, RootStackParamList } from '../types';
import { clipFileUrl, generateOrEditImage, getAllImageJobs, getImageJob, getImageQuota } from '../api';
import Card from '../components/Card';
import GradientButton from '../components/GradientButton';
import SectionHeader from '../components/SectionHeader';
import EmptyState from '../components/EmptyState';
import { colors, gradients, radius, spacing } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'ImageGenerator'>;

const POLL_INTERVAL_MS = 2000;
const MAX_POLL_ATTEMPTS = 150; // 5 minutes — a wedged job shouldn't spin this screen forever
// Must match server/src/index.ts's MAX_IMAGE_PROMPT_LENGTH — kept in sync by hand, same as every
// other client-side length cap in this app (mobile and server don't share a package).
const MAX_PROMPT_LENGTH = 2000;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

const STATUS_LABELS: Record<ImageJobSummary['status'], string> = {
  generating: 'Generating…',
  done: 'Done',
  failed: 'Failed',
};

// expo-image-picker's `mimeType` is frequently missing (notably for HEIC photos, the default
// format on iPhone) — falling back to a hardcoded 'image/jpeg' would mislabel the actual bytes
// sent to Gemini. Guess from the file extension instead, which is far more often right.
function guessMimeType(asset: ImagePicker.ImagePickerAsset): string {
  if (asset.mimeType) return asset.mimeType;
  const ext = asset.uri.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'heic':
    case 'heif':
      return 'image/heic';
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    default:
      return 'image/jpeg';
  }
}

// A fresh photo upload and "continue editing a past result" are mutually exclusive — one nullable
// union instead of two separately-nulled booleans/strings, so there's no way to leave both set at
// once (the two used to require every setter to remember to clear the other by hand).
type EditSource = { type: 'upload'; uri: string; fileName: string; mimeType: string } | { type: 'continue'; jobId: string };

export default function ImageGeneratorScreen({ navigation, route }: Props) {
  const [prompt, setPrompt] = useState('');
  const [source, setSource] = useState<EditSource | null>(null);
  const [generating, setGenerating] = useState(false);
  const [pastImages, setPastImages] = useState<ImageJobSummary[] | null>(null);
  const [loadingPast, setLoadingPast] = useState(false);
  const [quota, setQuota] = useState<ImageQuota | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  // Arriving here via "Continue editing" pre-seeds the chained-edit state instead of a fresh
  // photo. Clearing the param right after reading it (rather than leaving it in route.params)
  // means tapping "Continue editing" on the *same* job a second time still re-fires this effect —
  // otherwise React Navigation sees an unchanged param and the effect silently no-ops.
  useEffect(() => {
    if (route.params?.continueFromJobId) {
      setSource({ type: 'continue', jobId: route.params.continueFromJobId });
      navigation.setParams({ continueFromJobId: undefined });
    }
  }, [route.params?.continueFromJobId]);

  const loadPastImages = useCallback(() => {
    setLoadingPast(true);
    getAllImageJobs()
      .then(setPastImages)
      .catch((err) => Alert.alert('Failed to load past images', err instanceof Error ? err.message : String(err)))
      .finally(() => setLoadingPast(false));
  }, []);

  useFocusEffect(loadPastImages);
  useFocusEffect(useCallback(() => {
    getImageQuota().then(setQuota).catch(() => {});
  }, []));

  async function pickPhoto() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow photo library access to attach a photo to edit.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (result.canceled || result.assets.length === 0) return;

    const asset = result.assets[0];
    setSource({ type: 'upload', uri: asset.uri, fileName: asset.fileName ?? 'photo.jpg', mimeType: guessMimeType(asset) });
  }

  function clearSource() {
    setSource(null);
  }

  // A single Gemini call is fast enough that a full multi-stage Processing screen isn't
  // warranted — just poll in place until the image job leaves "generating", capped so a wedged
  // job doesn't spin this screen forever.
  async function pollUntilDone(imageJobId: string) {
    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS && !cancelledRef.current; attempt++) {
      const job = await getImageJob(imageJobId);
      if (job.status === 'done') {
        setGenerating(false);
        loadPastImages();
        navigation.navigate('ImageResult', { imageJobId });
        return;
      }
      if (job.status === 'failed') {
        setGenerating(false);
        loadPastImages();
        Alert.alert('Generation failed', job.error ?? 'Something went wrong.');
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
    if (!cancelledRef.current) {
      setGenerating(false);
      Alert.alert('Still working', 'This is taking longer than usual — check Past Images in a bit.');
    }
  }

  async function handleGenerate() {
    const trimmed = prompt.trim();
    if (!trimmed) {
      Alert.alert('Missing prompt', 'Describe the image you want first.');
      return;
    }
    setGenerating(true);
    try {
      const requestSource =
        source?.type === 'upload'
          ? { uri: source.uri, fileName: source.fileName, mimeType: source.mimeType }
          : source?.type === 'continue'
            ? { sourceImageJobId: source.jobId }
            : undefined;
      const { imageJobId, quota: newQuota } = await generateOrEditImage(trimmed, requestSource);
      setPrompt('');
      setSource(null);
      setQuota(newQuota); // the server already knows the updated count — no extra round-trip needed
      await pollUntilDone(imageJobId);
    } catch (err) {
      setGenerating(false);
      Alert.alert('Failed to start', err instanceof Error ? err.message : String(err));
    }
  }

  const isEditing = source !== null;

  return (
    <View style={styles.container}>
      <SectionHeader
        eyebrow="AI Image"
        title="Generate or edit an image"
        highlight="edit an image"
        highlightColor={colors.accentAI}
        subtitle="Describe what you want, or attach a photo and describe the edit."
      />

      <Card style={styles.inputCard}>
        <TextInput
          style={styles.input}
          placeholder="e.g. a cozy coffee shop interior, warm lighting"
          placeholderTextColor={colors.textMuted}
          value={prompt}
          onChangeText={(text) => setPrompt(text.slice(0, MAX_PROMPT_LENGTH))}
          editable={!generating}
          multiline
        />
        <Text style={styles.charCount}>
          {prompt.length}/{MAX_PROMPT_LENGTH}
        </Text>
      </Card>

      {source?.type === 'upload' ? (
        <View style={styles.attachedRow}>
          <Image source={{ uri: source.uri }} style={styles.attachedThumb} />
          <Text style={styles.attachedLabel} numberOfLines={1}>
            Editing this photo
          </Text>
          <TouchableOpacity onPress={clearSource} disabled={generating}>
            <Ionicons name="close-circle" size={22} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
      ) : source?.type === 'continue' ? (
        <View style={styles.attachedRow}>
          <Ionicons name="color-wand" size={20} color={colors.accentAI} style={styles.continueIcon} />
          <Text style={styles.attachedLabel} numberOfLines={1}>
            Continuing from a previous image
          </Text>
          <TouchableOpacity onPress={clearSource} disabled={generating}>
            <Ionicons name="close-circle" size={22} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity style={styles.attachButton} onPress={pickPhoto} disabled={generating} activeOpacity={0.85}>
          <Ionicons name="image-outline" size={18} color={colors.accentAI} style={styles.attachIcon} />
          <Text style={styles.attachButtonText}>Attach a photo to edit</Text>
        </TouchableOpacity>
      )}

      {quota && quota.remaining <= 0 ? (
        <View style={styles.limitCard}>
          <Ionicons name="lock-closed-outline" size={18} color={colors.textMuted} />
          <Text style={styles.limitText}>
            You&rsquo;ve used all {quota.limit} free AI image generations. Paid plans are coming soon.
          </Text>
        </View>
      ) : (
        <>
          <GradientButton
            label={isEditing ? 'Edit photo' : 'Generate'}
            icon={isEditing ? 'color-wand' : 'sparkles'}
            gradient={gradients.ai}
            onPress={handleGenerate}
            loading={generating}
            style={styles.generateButton}
          />
          {quota && (
            <Text style={styles.quotaText}>
              {quota.remaining} of {quota.limit} free generations left
            </Text>
          )}
        </>
      )}

      <Text style={styles.sectionTitle}>Past images</Text>
      {pastImages === null ? (
        <ActivityIndicator color={colors.accentAI} style={styles.pastLoading} />
      ) : pastImages.length === 0 ? (
        <EmptyState
          icon="image"
          title="No images yet"
          body="Your generated and edited images will appear here."
        />
      ) : (
        <FlatList
          style={styles.list}
          data={pastImages}
          keyExtractor={(job) => job.id}
          refreshing={loadingPast}
          onRefresh={loadPastImages}
          renderItem={({ item }) => (
            <TouchableOpacity
              disabled={item.status !== 'done'}
              onPress={() => navigation.navigate('ImageResult', { imageJobId: item.id })}
              activeOpacity={0.85}
            >
              <Card style={styles.pastCard}>
                <View style={styles.pastCardRow}>
                  {item.outputFile ? (
                    <Image source={{ uri: clipFileUrl(item.outputFile) }} style={styles.pastThumb} />
                  ) : (
                    <View style={[styles.pastThumb, styles.pastThumbPlaceholder]}>
                      <ActivityIndicator color={colors.accentAI} size="small" />
                    </View>
                  )}
                  <View style={styles.pastCardBody}>
                    <Text style={styles.cardPrompt} numberOfLines={2}>
                      {item.prompt}
                    </Text>
                    <View style={styles.cardFooter}>
                      <Text style={styles.cardMeta}>{item.mode === 'edit' ? 'Edit' : 'Generated'}</Text>
                      <Text style={styles.cardMeta}>{formatDate(item.createdAt)}</Text>
                      <Text style={[styles.cardStatus, item.status === 'failed' && styles.cardStatusFailed]}>
                        {STATUS_LABELS[item.status]}
                      </Text>
                    </View>
                  </View>
                </View>
              </Card>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: spacing.lg, paddingTop: 60 },
  inputCard: { marginBottom: spacing.md },
  input: { color: colors.textPrimary, fontSize: 15, minHeight: 44 },
  charCount: { color: colors.textMuted, fontSize: 11, textAlign: 'right', marginTop: spacing.xs },
  attachButton: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  attachIcon: { marginRight: spacing.xs },
  attachButtonText: { color: colors.accentAI, fontSize: 14, fontWeight: '600' },
  attachedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  attachedThumb: { width: 40, height: 40, borderRadius: radius.sm },
  continueIcon: { width: 40, textAlign: 'center' },
  attachedLabel: { flex: 1, color: colors.textSecondary, fontSize: 13 },
  generateButton: { marginBottom: spacing.xs },
  quotaText: { color: colors.textMuted, fontSize: 12, textAlign: 'center', marginBottom: spacing.lg },
  limitCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  limitText: { flex: 1, color: colors.textSecondary, fontSize: 13, lineHeight: 18 },
  sectionTitle: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: spacing.sm,
  },
  pastLoading: { marginTop: spacing.md },
  list: { flex: 1 },
  pastCard: { marginBottom: spacing.sm },
  pastCardRow: { flexDirection: 'row', gap: spacing.sm },
  pastThumb: { width: 56, height: 56, borderRadius: radius.sm },
  pastThumbPlaceholder: { backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  pastCardBody: { flex: 1, justifyContent: 'center' },
  cardPrompt: { color: colors.textPrimary, fontSize: 14, fontWeight: '600' },
  cardFooter: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  cardMeta: { color: colors.textMuted, fontSize: 12 },
  cardStatus: { color: colors.success, fontSize: 12, fontWeight: '600' },
  cardStatusFailed: { color: colors.danger },
});
