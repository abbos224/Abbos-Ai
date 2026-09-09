import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Alert, Linking, Image } from 'react-native';
import * as ExpoLinking from 'expo-linking';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { ChannelVideo, ChannelInsight, RootStackParamList } from '../types';
import { getYoutubeAnalytics, getYoutubeStatus, youtubeConnectUrl } from '../api';
import Card from '../components/Card';
import IconBadge from '../components/IconBadge';
import EmptyState from '../components/EmptyState';
import { colors, spacing, radius } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Analytics'>;

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatDuration(seconds: number): string {
  if (seconds <= 0) return '';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatDate(iso: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// One icon per real insight label (server's computeChannelInsights) — purely cosmetic, matches
// this app's established "icon + short label + detail" pattern for informational cards elsewhere.
const INSIGHT_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  'Top performer': 'trophy',
  Engagement: 'heart',
  Format: 'film',
};

export default function AnalyticsScreen({}: Props) {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [videos, setVideos] = useState<ChannelVideo[] | null>(null);
  const [insights, setInsights] = useState<ChannelInsight[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    getYoutubeStatus()
      .then(async (status) => {
        setConnected(status.connected);
        if (!status.connected) {
          setVideos([]);
          return;
        }
        const data = await getYoutubeAnalytics();
        setVideos(data.videos);
        setInsights(data.insights);
      })
      .catch((err) => Alert.alert('Failed to load analytics', err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(load);

  async function handleConnectYoutube() {
    try {
      const returnTo = ExpoLinking.createURL('/oauth-callback');
      const url = await youtubeConnectUrl(returnTo);
      await Linking.openURL(url);
    } catch (err) {
      Alert.alert('Failed to start YouTube connection', err instanceof Error ? err.message : String(err));
    }
  }

  if (loading && videos === null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (connected === false) {
    return (
      <View style={styles.center}>
        <EmptyState
          icon="logo-youtube"
          title="YouTube not connected"
          body="Connect your channel to see real view/like/comment stats for everything on it."
          ctaLabel="Connect YouTube"
          onPressCta={handleConnectYoutube}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <IconBadge icon="stats-chart" color={colors.accent} size={40} />
        <Text style={styles.title}>YouTube Performance</Text>
      </View>

      {videos && videos.length === 0 ? (
        <EmptyState
          icon="trending-up"
          title="Nothing uploaded yet"
          body="Upload something to your channel and its real stats will show up here."
        />
      ) : (
        <FlatList
          data={videos ?? []}
          keyExtractor={(item) => item.videoId}
          refreshing={loading}
          onRefresh={load}
          ListHeaderComponent={
            insights.length > 0 ? (
              <Card style={styles.insightsCard}>
                <Text style={styles.insightsTitle}>What your real numbers show</Text>
                {insights.map((insight) => (
                  <View key={insight.label} style={styles.insightRow}>
                    <Ionicons name={INSIGHT_ICONS[insight.label] ?? 'analytics'} size={16} color={colors.accent} />
                    <Text style={styles.insightText}>{insight.detail}</Text>
                  </View>
                ))}
              </Card>
            ) : null
          }
          renderItem={({ item }) => (
            <TouchableOpacity onPress={() => Linking.openURL(item.url)} activeOpacity={0.85}>
              <Card style={styles.card}>
                <View style={styles.row}>
                  <View style={styles.thumbnailWrap}>
                    {item.thumbnailUrl ? (
                      <Image source={{ uri: item.thumbnailUrl }} style={styles.thumbnail} resizeMode="cover" />
                    ) : (
                      <View style={styles.thumbnail} />
                    )}
                    {item.durationSec > 0 && (
                      <View style={styles.durationPill}>
                        <Text style={styles.durationPillText}>{formatDuration(item.durationSec)}</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.cardBody}>
                    <Text style={styles.cardTitle} numberOfLines={2}>
                      {item.title}
                    </Text>
                    {item.publishedFromApp && item.topic && (
                      <Text style={styles.cardHook} numberOfLines={1}>
                        &ldquo;{item.chosenHook}&rdquo;
                      </Text>
                    )}
                    <View style={styles.metaRow}>
                      <Text style={styles.cardMeta}>{formatDate(item.publishedAt)}</Text>
                      {item.publishedFromApp && (
                        <View style={styles.appBadge}>
                          <Text style={styles.appBadgeText}>via this app</Text>
                        </View>
                      )}
                    </View>
                  </View>
                </View>
                <View style={styles.statsRow}>
                  <View style={styles.stat}>
                    <Ionicons name="eye" size={14} color={colors.accent} />
                    <Text style={styles.statValue}>{formatCount(item.viewCount)}</Text>
                  </View>
                  <View style={styles.stat}>
                    <Ionicons name="heart" size={14} color={colors.accent} />
                    <Text style={styles.statValue}>{formatCount(item.likeCount)}</Text>
                  </View>
                  <View style={styles.stat}>
                    <Ionicons name="chatbubble" size={14} color={colors.accent} />
                    <Text style={styles.statValue}>{formatCount(item.commentCount)}</Text>
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
  center: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
  title: { flex: 1, color: colors.textPrimary, fontSize: 18, fontWeight: '700' },
  insightsCard: { marginBottom: spacing.md, gap: spacing.sm },
  insightsTitle: { color: colors.textPrimary, fontSize: 14, fontWeight: '700' },
  insightRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  insightText: { flex: 1, color: colors.textSecondary, fontSize: 13, lineHeight: 18 },
  card: { marginBottom: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm },
  // 16:9 (not the old 1.5:1 box) — matches the real aspect ratio YouTube's own thumbnails.medium
  // always returns, even for vertical Shorts (YouTube crops those to 16:9 itself), so the image
  // fills the box cleanly instead of leaving letterboxed gaps top/bottom.
  thumbnailWrap: { width: 104, height: 58.5, borderRadius: radius.sm, overflow: 'hidden', backgroundColor: colors.surface },
  thumbnail: { width: '100%', height: '100%' },
  durationPill: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  durationPillText: { color: '#FFFFFF', fontSize: 10, fontWeight: '700' },
  cardBody: { flex: 1, justifyContent: 'center' },
  cardTitle: { color: colors.textPrimary, fontSize: 14, fontWeight: '600' },
  cardHook: { color: colors.textSecondary, fontSize: 12, marginTop: 2, fontStyle: 'italic' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  cardMeta: { color: colors.textMuted, fontSize: 11 },
  appBadge: { backgroundColor: colors.accentSurface, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  appBadgeText: { color: colors.accent, fontSize: 10, fontWeight: '600' },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.lg,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statValue: { color: colors.textPrimary, fontSize: 14, fontWeight: '700' },
});
