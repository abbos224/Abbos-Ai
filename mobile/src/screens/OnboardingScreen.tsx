import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useI18n } from '../i18n/LanguageContext';
import type { TranslationKey } from '../i18n';
import IconBadge from '../components/IconBadge';
import GradientButton from '../components/GradientButton';
import LanguageSwitcher from '../components/LanguageSwitcher';
import { setOnboardingComplete } from '../onboardingStorage';
import { colors, gradients, radius, spacing } from '../theme';

// A one-time first-run intro, shown by App.tsx's AppShell after login and before the tab bar the
// first time only (a SecureStore flag; see onboardingStorage). Every step is real: the language
// step actually sets the app language, and the rest is a plain walkthrough of features that exist.
const STEP_COUNT = 3;

const BENEFITS: { icon: keyof typeof Ionicons.glyphMap; titleKey: TranslationKey; bodyKey: TranslationKey; color: string }[] = [
  { icon: 'cut', titleKey: 'onboarding.benefit1Title', bodyKey: 'onboarding.benefit1Body', color: colors.accent },
  { icon: 'sparkles', titleKey: 'onboarding.benefit2Title', bodyKey: 'onboarding.benefit2Body', color: colors.accentAI },
  { icon: 'calendar', titleKey: 'onboarding.benefit3Title', bodyKey: 'onboarding.benefit3Body', color: colors.accent },
];

const TOUR: { icon: keyof typeof Ionicons.glyphMap; labelKey: TranslationKey; color: string }[] = [
  { icon: 'cloud-upload', labelKey: 'onboarding.tourUpload', color: colors.accent },
  { icon: 'bulb', labelKey: 'onboarding.tourIdeas', color: colors.accentAI },
  { icon: 'image', labelKey: 'onboarding.tourImage', color: colors.accentAI },
];

export default function OnboardingScreen({ onDone }: { onDone: () => void }) {
  const { t } = useI18n();
  const [step, setStep] = useState(0);
  const [finishing, setFinishing] = useState(false);

  async function finish() {
    setFinishing(true);
    try {
      await setOnboardingComplete();
    } finally {
      onDone();
    }
  }

  const isLast = step === STEP_COUNT - 1;

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <View style={styles.dots}>
          {Array.from({ length: STEP_COUNT }).map((_, i) => (
            <View key={i} style={[styles.dot, i === step && styles.dotActive]} />
          ))}
        </View>
        {!isLast && (
          <TouchableOpacity onPress={finish} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={styles.skip}>{t('onboarding.skip')}</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {step === 0 && (
          <View>
            <IconBadge icon="rocket" color={colors.accent} size={60} />
            <Text style={styles.title}>{t('onboarding.welcomeTitle')}</Text>
            <Text style={styles.subtitle}>{t('onboarding.welcomeSubtitle')}</Text>
            <View style={styles.benefitList}>
              {BENEFITS.map((b) => (
                <View key={b.titleKey} style={styles.benefitRow}>
                  <View style={[styles.benefitIcon, { borderColor: b.color }]}>
                    <Ionicons name={b.icon} size={18} color={b.color} />
                  </View>
                  <View style={styles.benefitText}>
                    <Text style={styles.benefitTitle}>{t(b.titleKey)}</Text>
                    <Text style={styles.benefitBody}>{t(b.bodyKey)}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {step === 1 && (
          <View>
            <IconBadge icon="language" color={colors.accentAI} size={60} />
            <Text style={styles.title}>{t('onboarding.languageTitle')}</Text>
            <Text style={styles.subtitle}>{t('onboarding.languageSubtitle')}</Text>
            <View style={styles.languageWrap}>
              <LanguageSwitcher compact />
            </View>
          </View>
        )}

        {step === 2 && (
          <View>
            <IconBadge icon="add-circle" color={colors.accent} size={60} />
            <Text style={styles.title}>{t('onboarding.tourTitle')}</Text>
            <View style={styles.tourList}>
              {TOUR.map((item) => (
                <View key={item.labelKey} style={styles.tourRow}>
                  <View style={[styles.benefitIcon, { borderColor: item.color }]}>
                    <Ionicons name={item.icon} size={18} color={item.color} />
                  </View>
                  <Text style={styles.tourLabel}>{t(item.labelKey)}</Text>
                </View>
              ))}
            </View>
            <View style={styles.youtubeHint}>
              <Ionicons name="logo-youtube" size={16} color={colors.textMuted} />
              <Text style={styles.youtubeHintText}>{t('onboarding.tourYoutube')}</Text>
            </View>
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        {step > 0 && (
          <TouchableOpacity style={styles.backButton} onPress={() => setStep((s) => s - 1)} disabled={finishing}>
            <Text style={styles.backText}>{t('onboarding.back')}</Text>
          </TouchableOpacity>
        )}
        <GradientButton
          label={isLast ? t('onboarding.start') : t('onboarding.next')}
          onPress={isLast ? finish : () => setStep((s) => s + 1)}
          loading={finishing}
          gradient={step === 1 ? gradients.ai : gradients.brand}
          style={styles.nextButton}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.lg, paddingTop: 64, paddingBottom: spacing.lg },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xl },
  dots: { flexDirection: 'row', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.border },
  dotActive: { backgroundColor: colors.accent, width: 20 },
  skip: { color: colors.textSecondary, fontSize: 14, fontWeight: '600' },
  body: { paddingBottom: spacing.xl },
  title: { color: colors.textPrimary, fontSize: 24, fontWeight: '700', marginTop: spacing.lg },
  subtitle: { color: colors.textSecondary, fontSize: 14, lineHeight: 20, marginTop: spacing.sm },
  benefitList: { marginTop: spacing.xl, gap: spacing.lg },
  benefitRow: { flexDirection: 'row', gap: spacing.md },
  benefitIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  benefitText: { flex: 1 },
  benefitTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: '600' },
  benefitBody: { color: colors.textSecondary, fontSize: 13, lineHeight: 18, marginTop: 2 },
  languageWrap: { marginTop: spacing.xl },
  tourList: { marginTop: spacing.xl, gap: spacing.md },
  tourRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  tourLabel: { color: colors.textPrimary, fontSize: 14, fontWeight: '500', flex: 1 },
  youtubeHint: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xl,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  youtubeHintText: { color: colors.textSecondary, fontSize: 12, lineHeight: 17, flex: 1 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  backButton: { paddingVertical: 16, paddingHorizontal: spacing.md },
  backText: { color: colors.textSecondary, fontSize: 15, fontWeight: '600' },
  nextButton: { flex: 1 },
});
