import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Alert, Linking, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as ExpoLinking from 'expo-linking';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { ChannelVideo, ChannelInsight, ChannelSummary, DailyViews, TrendChange, RootStackParamList } from '../types';
import { getYoutubeAnalytics, getYoutubeStatus, youtubeConnectUrl } from '../api';
import Card from '../components/Card';
import IconBadge from '../components/IconBadge';
import EmptyState from '../components/EmptyState';
import { colors, gradients, spacing, radius } from '../theme';

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

/** One gradient headline number — real sums/averages from computeChannelSummary, never a
 * placeholder. Alternates the app's two established gradient tokens for visual rhythm. */
function StatTile({
  icon,
  label,
  value,
  gradient,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  gradient: readonly [string, string];
}) {
  return (
    <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.statTile}>
      <Ionicons name={icon} size={16} color={colors.onAccent} />
      <Text style={styles.statTileValue}>{value}</Text>
      <Text style={styles.statTileLabel}>{label}</Text>
    </LinearGradient>
  );
}

/** A real horizontal bar chart of the channel's own top 5 videos by view count — bar widths are
 * plain percentage-of-max View widths (no charting library needed, no new dependency), gradient-
 * filled to match this app's established visual language. Every bar's length is a real number. */
function TopVideosChart({ videos }: { videos: ChannelVideo[] }) {
  const top = [...videos].sort((a, b) => b.viewCount - a.viewCount).slice(0, 5);
  const maxViews = Math.max(...top.map((v) => v.viewCount), 1);
  if (top.length < 2 || maxViews === 0) return null;

  return (
    <Card style={styles.chartCard}>
      <Text style={styles.insightsTitle}>Top videos by views</Text>
      {top.map((v) => (
        <View key={v.videoId} style={styles.chartRow}>
          <Text style={styles.chartRowTitle} numberOfLines={1}>
            {v.title}
          </Text>
          <View style={styles.chartBarTrack}>
            <LinearGradient
              colors={gradients.ai}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.chartBarFill, { width: `${Math.max(6, (v.viewCount / maxViews) * 100)}%` }]}
            />
          </View>
          <Text style={styles.chartRowValue}>{formatCount(v.viewCount)}</Text>
        </View>
      ))}
    </Card>
  );
}

const SPARKLINE_HEIGHT = 56;

/**
 * The real headline "views over time" chart YouTube Studio's own dashboard is built around — a
 * genuine day-by-day bar sparkline (server's getViewsTrend, the actual YouTube Analytics API, not
 * the Data API's lifetime-total-only videos.list) plus a real vs.-previous-period % change badge.
 * `trend`/`trendChange` are null for an account connected before this scope existed — shown as a
 * real, actionable "reconnect for this" prompt instead of an empty or fake chart.
 */
function ViewsTrendChart({
  trend,
  trendChange,
  onReconnect,
}: {
  trend: DailyViews[] | null;
  trendChange: TrendChange | null;
  onReconnect: () => void;
}) {
  if (!trend || trend.length === 0) {
    return (
      <Card style={styles.trendCard}>
        <View style={styles.trendReconnectRow}>
          <Ionicons name="analytics-outline" size={22} color={colors.accent} />
          <View style={styles.trendReconnectTextWrap}>
            <Text style={styles.trendReconnectTitle}>See your daily views trend</Text>
            <Text style={styles.trendReconnectBody}>Reconnect YouTube to unlock the real day-by-day chart.</Text>
          </View>
          <TouchableOpacity onPress={onReconnect} style={styles.trendReconnectButton}>
            <Text style={styles.trendReconnectButtonText}>Reconnect</Text>
          </TouchableOpacity>
        </View>
      </Card>
    );
  }

  const maxViews = Math.max(...trend.map((d) => d.views), 1);
  const changePercent = trendChange?.changePercent ?? null;
  const isUp = (changePercent ?? 0) >= 0;

  return (
    <Card style={styles.trendCard}>
      <Text style={styles.insightsTitle}>Views — last {trend.length} days</Text>
      <View style={styles.trendHeadlineRow}>
        <Text style={styles.trendHeadlineValue}>{formatCount(trendChange?.currentPeriodViews ?? 0)}</Text>
        {changePercent !== null && (
          <View
            style={[
              styles.trendChangeBadge,
              { backgroundColor: isUp ? `${colors.success}22` : `${colors.danger}22` },
            ]}
          >
            <Ionicons name={isUp ? 'trending-up' : 'trending-down'} size={12} color={isUp ? colors.success : colors.danger} />
            <Text style={[styles.trendChangeText, { color: isUp ? colors.success : colors.danger }]}>
              {Math.abs(changePercent).toFixed(0)}% vs. previous period
            </Text>
          </View>
        )}
      </View>
      <View style={styles.sparklineRow}>
        {trend.map((d) => (
          <LinearGradient
            key={d.date}
            colors={gradients.ai}
            start={{ x: 0, y: 1 }}
            end={{ x: 0, y: 0 }}
            style={[styles.sparklineBar, { height: Math.max(4, (d.views / maxViews) * SPARKLINE_HEIGHT) }]}
          />
        ))}
      </View>
    </Card>
  );
}

export default function AnalyticsScreen({}: Props) {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [videos, setVideos] = useState<ChannelVideo[] | null>(null);
  const [insights, setInsights] = useState<ChannelInsight[]>([]);
  const [summary, setSummary] = useState<ChannelSummary | null>(null);
  const [trend, setTrend] = useState<DailyViews[] | null>(null);
  const [trendChange, setTrendChange] = useState<TrendChange | null>(null);
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
        setSummary(data.summary);
        setTrend(data.trend);
        setTrendChange(data.trendChange);
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
            <>
              <ViewsTrendChart trend={trend} trendChange={trendChange} onReconnect={handleConnectYoutube} />
              {summary && (
                <View style={styles.statTileRow}>
                  <StatTile icon="eye" label="Total views" value={formatCount(summary.totalViews)} gradient={gradients.ai} />
                  <StatTile icon="film" label="Videos" value={String(summary.totalVideos)} gradient={gradients.brand} />
                  <StatTile
                    icon="heart"
                    label="Engagement"
                    value={`${(summary.avgEngagementRate * 100).toFixed(1)}%`}
                    gradient={gradients.ai}
                  />
                </View>
              )}
              {videos && <TopVideosChart videos={videos} />}
              {insights.length > 0 && (
                <Card style={styles.insightsCard}>
                  <Text style={styles.insightsTitle}>What your real numbers show</Text>
                  {insights.map((insight) => (
                    <View key={insight.label} style={styles.insightRow}>
                      <Ionicons name={INSIGHT_ICONS[insight.label] ?? 'analytics'} size={16} color={colors.accent} />
                      <Text style={styles.insightText}>{insight.detail}</Text>
                    </View>
                  ))}
                </Card>
              )}
            </>
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
  trendCard: { marginBottom: spacing.md, gap: spacing.sm },
  trendHeadlineRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  trendHeadlineValue: { color: colors.textPrimary, fontSize: 28, fontWeight: '800' },
  trendChangeBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 3 },
  trendChangeText: { fontSize: 11, fontWeight: '700' },
  sparklineRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: SPARKLINE_HEIGHT, marginTop: spacing.xs },
  sparklineBar: { flex: 1, borderRadius: 2, minWidth: 2 },
  trendReconnectRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  trendReconnectTextWrap: { flex: 1 },
  trendReconnectTitle: { color: colors.textPrimary, fontSize: 14, fontWeight: '600' },
  trendReconnectBody: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  trendReconnectButton: { backgroundColor: colors.accentSurface, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 8 },
  trendReconnectButtonText: { color: colors.accent, fontSize: 12, fontWeight: '700' },
  statTileRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  statTile: { flex: 1, borderRadius: radius.lg, padding: spacing.sm, gap: 2 },
  statTileValue: { color: colors.onAccent, fontSize: 20, fontWeight: '800', marginTop: 4 },
  statTileLabel: { color: colors.onAccent, fontSize: 11, opacity: 0.85 },
  chartCard: { marginBottom: spacing.md, gap: spacing.sm },
  chartRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chartRowTitle: { width: 90, color: colors.textSecondary, fontSize: 11 },
  chartBarTrack: { flex: 1, height: 16, borderRadius: radius.sm, backgroundColor: colors.background, overflow: 'hidden' },
  chartBarFill: { height: '100%', borderRadius: radius.sm },
  chartRowValue: { width: 44, textAlign: 'right', color: colors.textPrimary, fontSize: 12, fontWeight: '700' },
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
