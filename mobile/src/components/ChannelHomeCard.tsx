import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, Linking } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import type { ChannelHomeSummary } from '../types';
import { getChannelHome, getYoutubeStatus } from '../api';
import { useI18n } from '../i18n/LanguageContext';
import { formatCount, formatDate } from '../utils/format';
import Card from './Card';
import { colors, radius, spacing } from '../theme';

/**
 * A real channel snapshot at the top of the Create tab — YouTube Studio's own Home dashboard,
 * scaled to what this app can honestly show: subscriber / view / video counts, the latest upload,
 * all straight from the Data API (see server's getChannelHomeSummary). Renders nothing until a
 * channel is actually connected — no placeholder, no fake numbers. Growth-over-time percentages
 * live on the Analytics tab, which has the real day-by-day data for them.
 */
export default function ChannelHomeCard() {
  const { t } = useI18n();
  const [summary, setSummary] = useState<ChannelHomeSummary | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      getYoutubeStatus()
        .then((status) => {
          if (cancelled || !status.connected) return;
          return getChannelHome().then((data) => {
            if (!cancelled) setSummary(data);
          });
        })
        .catch(() => {
          // A transient failure just means the card stays hidden this visit — the Create flow
          // below it is unaffected.
        });
      return () => {
        cancelled = true;
      };
    }, []),
  );

  if (!summary) return null;

  const stats: { key: string; label: string; value: string }[] = [
    {
      key: 'subs',
      label: t('home.subscribers'),
      value: summary.subscriberCount === null ? t('home.subscribersHidden') : formatCount(summary.subscriberCount),
    },
    { key: 'views', label: t('home.views'), value: formatCount(summary.totalViews) },
    { key: 'videos', label: t('home.videos'), value: formatCount(summary.totalVideos) },
  ];

  return (
    <Card style={styles.card} variant="highlight">
      <View style={styles.headerRow}>
        {summary.channelThumbnailUrl ? (
          <Image source={{ uri: summary.channelThumbnailUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder]}>
            <Ionicons name="logo-youtube" size={20} color={colors.accent} />
          </View>
        )}
        <Text style={styles.channelTitle} numberOfLines={1}>
          {summary.channelTitle}
        </Text>
      </View>

      <View style={styles.statsRow}>
        {stats.map((s) => (
          <View key={s.key} style={styles.statTile}>
            <Text style={styles.statValue}>{s.value}</Text>
            <Text style={styles.statLabel}>{s.label}</Text>
          </View>
        ))}
      </View>

      {summary.latestVideo && (
        <TouchableOpacity onPress={() => Linking.openURL(summary.latestVideo!.url)} activeOpacity={0.85}>
          <Text style={styles.latestLabel}>{t('home.latestVideo')}</Text>
          <View style={styles.latestRow}>
            <View style={styles.latestThumbWrap}>
              {summary.latestVideo.thumbnailUrl ? (
                <Image source={{ uri: summary.latestVideo.thumbnailUrl }} style={styles.latestThumb} resizeMode="cover" />
              ) : (
                <View style={styles.latestThumb} />
              )}
            </View>
            <View style={styles.latestBody}>
              <Text style={styles.latestTitle} numberOfLines={2}>
                {summary.latestVideo.title}
              </Text>
              <Text style={styles.latestMeta}>
                {formatCount(summary.latestVideo.viewCount)} {t('home.views').toLowerCase()} ·{' '}
                {formatDate(summary.latestVideo.publishedAt)}
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: spacing.lg, gap: spacing.md },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface },
  avatarPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  channelTitle: { flex: 1, color: colors.textPrimary, fontSize: 16, fontWeight: '700' },
  statsRow: { flexDirection: 'row', gap: spacing.sm },
  statTile: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  statValue: { color: colors.textPrimary, fontSize: 17, fontWeight: '800' },
  statLabel: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  latestLabel: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  latestRow: { flexDirection: 'row', gap: spacing.sm },
  latestThumbWrap: { width: 96, height: 54, borderRadius: radius.sm, overflow: 'hidden', backgroundColor: colors.surface },
  latestThumb: { width: '100%', height: '100%' },
  latestBody: { flex: 1, justifyContent: 'center' },
  latestTitle: { color: colors.textPrimary, fontSize: 13, fontWeight: '600' },
  latestMeta: { color: colors.textMuted, fontSize: 11, marginTop: 3 },
});
