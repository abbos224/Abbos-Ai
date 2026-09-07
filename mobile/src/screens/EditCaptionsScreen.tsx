import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, ScrollView } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { CaptionWord, RootStackParamList, WordFormatOverride } from '../types';
import { getCaptionWords, saveCaptionEdits } from '../api';
import Card from '../components/Card';
import GradientButton from '../components/GradientButton';
import IconBadge from '../components/IconBadge';
import { colors, radius, spacing } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'EditCaptions'>;

// A punchier, more saturated palette than BrandKitScreen's muted brand colors — that palette is
// explicitly "modest, business" branding; caption emphasis wants CapCut-style pop colors.
const WORD_COLORS = ['#FFD60A', '#FF3B30', '#22D3EE', '#34C759', '#FFFFFF', '#7C3AED'];
const SCALE_STEPS = [100, 120, 140, 160];

const EMPTY_PATCH: Partial<WordFormatOverride> = {
  color: undefined,
  bold: undefined,
  italic: undefined,
  highlightColor: undefined,
  scale: undefined,
};

export default function EditCaptionsScreen({ route, navigation }: Props) {
  const { clip } = route.params;
  const [words, setWords] = useState<CaptionWord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getCaptionWords(clip.jobId, clip.id)
      .then((res) => setWords(res.words))
      .catch((err) => setLoadError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [clip.jobId, clip.id]);

  function toggleSelect(start: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(start)) next.delete(start);
      else next.add(start);
      return next;
    });
  }

  function applyToSelection(patch: Partial<WordFormatOverride>) {
    if (selected.size === 0) return;
    setWords((prev) => prev.map((w) => (selected.has(w.start) ? { ...w, ...patch } : w)));
  }

  const selectedWords = words.filter((w) => selected.has(w.start));
  const anySelectedBold = selectedWords.some((w) => w.bold);
  const anySelectedItalic = selectedWords.some((w) => w.italic);
  const currentScale = selectedWords[0]?.scale;

  async function handleSave() {
    const overrides: WordFormatOverride[] = words
      .filter((w) => w.color || w.bold || w.italic || w.highlightColor || w.scale)
      .map((w) => ({
        start: w.start,
        color: w.color,
        bold: w.bold,
        italic: w.italic,
        highlightColor: w.highlightColor,
        scale: w.scale,
      }));

    setSaving(true);
    try {
      const { outputFile } = await saveCaptionEdits(clip.jobId, clip.id, overrides);
      // Query-string cache-bust: the file on disk is overwritten in place (same path), but
      // expo-video's player only reloads when the videoUrl STRING itself changes — Express's
      // static file server ignores query strings, so the same file still resolves correctly.
      navigation.replace('Preview', {
        clip: { ...clip, captionOverrides: overrides, outputFile: `${outputFile}?t=${Date.now()}` },
      });
    } catch (err) {
      Alert.alert('Save failed', err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{loadError}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.hint}>
        Tap a word (or several) to select it, then apply a format below. Select again to
        deselect.
      </Text>

      <Card style={styles.wordCard}>
        <View style={styles.wordWrap}>
          {words.map((w) => {
            const isSelected = selected.has(w.start);
            return (
              <TouchableOpacity
                key={w.start}
                onPress={() => toggleSelect(w.start)}
                style={[
                  styles.wordChip,
                  isSelected && styles.wordChipSelected,
                  w.highlightColor && { borderColor: w.highlightColor, borderWidth: 2 },
                ]}
              >
                <Text
                  style={[
                    styles.wordText,
                    w.color ? { color: w.color } : null,
                    w.bold && styles.wordTextBold,
                    w.italic && styles.wordTextItalic,
                    w.scale ? { fontSize: 15 * (w.scale / 100) } : null,
                  ]}
                >
                  {w.text}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </Card>

      <Card style={styles.toolbarCard}>
        <Text style={styles.toolbarLabel}>
          {selected.size === 0 ? 'Select word(s) above to format them' : `${selected.size} word(s) selected`}
        </Text>

        <View style={styles.toolbarRow}>
          <TouchableOpacity
            style={[styles.toggleChip, anySelectedBold && styles.toggleChipActive]}
            disabled={selected.size === 0}
            onPress={() => applyToSelection({ bold: !anySelectedBold })}
          >
            <Text style={[styles.toggleChipTextBold, anySelectedBold && styles.toggleChipTextActive]}>B</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleChip, anySelectedItalic && styles.toggleChipActive]}
            disabled={selected.size === 0}
            onPress={() => applyToSelection({ italic: !anySelectedItalic })}
          >
            <Text style={[styles.toggleChipTextItalic, anySelectedItalic && styles.toggleChipTextActive]}>I</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.toggleChip}
            disabled={selected.size === 0}
            onPress={() => applyToSelection(EMPTY_PATCH)}
          >
            <Text style={styles.toggleChipText}>Clear</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.toolbarRow}>
          <IconBadge icon="color-palette" color={colors.accent} size={22} />
          {WORD_COLORS.map((c) => (
            <TouchableOpacity
              key={c}
              style={[styles.swatch, { backgroundColor: c }]}
              disabled={selected.size === 0}
              onPress={() => applyToSelection({ color: c })}
            />
          ))}
        </View>

        <View style={styles.toolbarRow}>
          <IconBadge icon="color-fill" color={colors.accent} size={22} />
          {WORD_COLORS.map((c) => (
            <TouchableOpacity
              key={c}
              style={[styles.swatch, styles.swatchOutlineOnly, { borderColor: c }]}
              disabled={selected.size === 0}
              onPress={() => applyToSelection({ highlightColor: c })}
            />
          ))}
        </View>

        <View style={styles.toolbarRow}>
          <IconBadge icon="resize-outline" color={colors.accent} size={22} />
          {SCALE_STEPS.map((pct) => (
            <TouchableOpacity
              key={pct}
              style={[styles.scaleChip, currentScale === pct && styles.toggleChipActive]}
              disabled={selected.size === 0}
              onPress={() => applyToSelection({ scale: pct === 100 ? undefined : pct })}
            >
              <Text style={[styles.toggleChipText, currentScale === pct && styles.toggleChipTextActive]}>{pct}%</Text>
            </TouchableOpacity>
          ))}
        </View>
      </Card>

      <GradientButton
        label="Save & Re-render"
        icon="checkmark-circle-outline"
        loading={saving}
        onPress={handleSave}
        style={styles.saveButton}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  centered: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  errorText: { color: colors.danger, fontSize: 14, textAlign: 'center' },
  hint: { color: colors.textSecondary, fontSize: 13, lineHeight: 18, marginBottom: spacing.md },
  wordCard: { marginBottom: spacing.md },
  wordWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  wordChip: {
    borderWidth: 1,
    borderColor: 'transparent',
    borderRadius: radius.sm,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  wordChipSelected: { borderColor: colors.accent, backgroundColor: colors.accentSurface },
  wordText: { color: colors.textPrimary, fontSize: 15 },
  wordTextBold: { fontWeight: '700' },
  wordTextItalic: { fontStyle: 'italic' },
  toolbarCard: { marginBottom: spacing.md, gap: spacing.sm },
  toolbarLabel: { color: colors.textSecondary, fontSize: 12, marginBottom: spacing.xs },
  toolbarRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  toggleChip: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    borderRadius: radius.md,
    paddingVertical: 8,
    paddingHorizontal: 14,
    minWidth: 40,
    alignItems: 'center',
  },
  toggleChipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  toggleChipText: { color: colors.textPrimary, fontSize: 13, fontWeight: '600' },
  toggleChipTextBold: { color: colors.textPrimary, fontSize: 15, fontWeight: '700' },
  toggleChipTextItalic: { color: colors.textPrimary, fontSize: 15, fontStyle: 'italic' },
  toggleChipTextActive: { color: colors.onAccent },
  swatch: { width: 32, height: 32, borderRadius: radius.md },
  swatchOutlineOnly: { width: 32, height: 32, borderRadius: radius.md, borderWidth: 3, backgroundColor: 'transparent' },
  scaleChip: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    borderRadius: radius.md,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  saveButton: { marginTop: spacing.sm },
});
