import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Image, ScrollView } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { CaptionStyleName, SoundEffectsStyle, RootStackParamList } from '../types';
import {
  getBrandKit,
  setBrandAccentColor,
  uploadBrandLogo,
  clipFileUrl,
  getCaptionStyles,
  setCaptionStyle,
  getSoundEffectsStyles,
  setSoundEffectsStyle,
} from '../api';
import { colors, radius, spacing } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'BrandKit'>;

// A restrained palette, not a full picker — fits the "modest, business" positioning better than
// letting people pick neon colors for their captions.
const PRESET_COLORS = ['#1F3A5F', '#3D6B57', '#7A5C3E', '#5C3D5C', '#4A4A48', '#A6362C'];

export default function BrandKitScreen({}: Props) {
  const [logoUrl, setLogoUrl] = useState<string | undefined>();
  const [accentColor, setAccentColor] = useState<string | undefined>();
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [savingColor, setSavingColor] = useState<string | null>(null);
  const [captionStyles, setCaptionStyles] = useState<CaptionStyleName[]>([]);
  const [activeStyle, setActiveStyle] = useState<CaptionStyleName>('bold');
  const [savingStyle, setSavingStyle] = useState<CaptionStyleName | null>(null);
  const [effectsStyles, setEffectsStyles] = useState<SoundEffectsStyle[]>([]);
  const [activeEffectsStyle, setActiveEffectsStyle] = useState<SoundEffectsStyle>('professional');
  const [savingEffectsStyle, setSavingEffectsStyle] = useState<SoundEffectsStyle | null>(null);

  useEffect(() => {
    getBrandKit()
      .then((kit) => {
        setLogoUrl(kit.logoUrl);
        setAccentColor(kit.accentColor);
        if (kit.captionStyle) setActiveStyle(kit.captionStyle);
        if (kit.soundEffectsStyle) setActiveEffectsStyle(kit.soundEffectsStyle);
      })
      .catch(() => {});
    getCaptionStyles().then(setCaptionStyles).catch(() => {});
    getSoundEffectsStyles().then(setEffectsStyles).catch(() => {});
  }, []);

  async function pickLogo() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Нужен доступ', 'Разрешите доступ к галерее, чтобы выбрать логотип.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'] });
    if (result.canceled || result.assets.length === 0) return;

    const asset = result.assets[0];
    setUploadingLogo(true);
    try {
      const kit = await uploadBrandLogo(asset.uri, asset.fileName ?? 'logo.png');
      setLogoUrl(kit.logoUrl);
    } catch (err) {
      Alert.alert('Upload failed', err instanceof Error ? err.message : String(err));
    } finally {
      setUploadingLogo(false);
    }
  }

  async function pickColor(color: string) {
    setSavingColor(color);
    try {
      await setBrandAccentColor(color);
      setAccentColor(color);
    } catch (err) {
      Alert.alert('Save failed', err instanceof Error ? err.message : String(err));
    } finally {
      setSavingColor(null);
    }
  }

  async function pickStyle(style: CaptionStyleName) {
    setSavingStyle(style);
    try {
      await setCaptionStyle(style);
      setActiveStyle(style);
    } catch (err) {
      Alert.alert('Save failed', err instanceof Error ? err.message : String(err));
    } finally {
      setSavingStyle(null);
    }
  }

  async function pickEffectsStyle(style: SoundEffectsStyle) {
    setSavingEffectsStyle(style);
    try {
      await setSoundEffectsStyle(style);
      setActiveEffectsStyle(style);
    } catch (err) {
      Alert.alert('Save failed', err instanceof Error ? err.message : String(err));
    } finally {
      setSavingEffectsStyle(null);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>Logo</Text>
      <Text style={styles.sectionHint}>Appears in the top-right corner of every Reel you export.</Text>

      <TouchableOpacity style={styles.logoBox} onPress={pickLogo} disabled={uploadingLogo}>
        {uploadingLogo ? (
          <ActivityIndicator color={colors.accent} />
        ) : logoUrl ? (
          <Image source={{ uri: clipFileUrl(logoUrl) }} style={styles.logoPreview} resizeMode="contain" />
        ) : (
          <Text style={styles.logoBoxText}>Upload logo</Text>
        )}
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>Brand color</Text>
      <Text style={styles.sectionHint}>Used as the caption outline color across your Reels.</Text>

      <View style={styles.colorRow}>
        {PRESET_COLORS.map((color) => (
          <TouchableOpacity
            key={color}
            style={[
              styles.swatch,
              { backgroundColor: color },
              accentColor === color && styles.swatchActive,
            ]}
            onPress={() => pickColor(color)}
            disabled={savingColor !== null}
          >
            {savingColor === color && <ActivityIndicator size="small" color={colors.onAccent} />}
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.sectionTitle}>Caption style</Text>
      <Text style={styles.sectionHint}>How every hook and caption is set — from a quiet minimal look to a full kinetic pop.</Text>

      <View style={styles.styleGrid}>
        {captionStyles.map((style) => (
          <TouchableOpacity
            key={style}
            style={[styles.styleChip, activeStyle === style && styles.styleChipActive]}
            onPress={() => pickStyle(style)}
            disabled={savingStyle !== null}
          >
            {savingStyle === style ? (
              <ActivityIndicator size="small" color={activeStyle === style ? colors.onAccent : colors.accent} />
            ) : (
              <Text style={[styles.styleChipText, activeStyle === style && styles.styleChipTextActive]}>
                {style[0].toUpperCase() + style.slice(1)}
              </Text>
            )}
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.sectionTitle}>Sound effects</Text>
      <Text style={styles.sectionHint}>
        Professional keeps Reels quiet; Minimal adds a subtle whoosh on zoom; Dynamic also dings on
        numbers/prices and alerts on warning words.
      </Text>

      <View style={styles.styleGrid}>
        {effectsStyles.map((style) => (
          <TouchableOpacity
            key={style}
            style={[styles.styleChip, activeEffectsStyle === style && styles.styleChipActive]}
            onPress={() => pickEffectsStyle(style)}
            disabled={savingEffectsStyle !== null}
          >
            {savingEffectsStyle === style ? (
              <ActivityIndicator size="small" color={activeEffectsStyle === style ? colors.onAccent : colors.accent} />
            ) : (
              <Text style={[styles.styleChipText, activeEffectsStyle === style && styles.styleChipTextActive]}>
                {style[0].toUpperCase() + style.slice(1)}
              </Text>
            )}
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  sectionTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: '600', marginTop: spacing.md },
  sectionHint: { color: colors.textSecondary, fontSize: 13, marginTop: 4, marginBottom: spacing.md },
  logoBox: {
    height: 100,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoBoxText: { color: colors.textSecondary, fontSize: 14, fontWeight: '600' },
  logoPreview: { width: '80%', height: '80%' },
  colorRow: { flexDirection: 'row', gap: 12 },
  swatch: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchActive: { borderWidth: 3, borderColor: colors.textPrimary },
  styleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  styleChip: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: 10,
    paddingHorizontal: 14,
    minWidth: 78,
    alignItems: 'center',
  },
  styleChipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  styleChipText: { color: colors.textPrimary, fontSize: 13, fontWeight: '600' },
  styleChipTextActive: { color: colors.onAccent },
});
