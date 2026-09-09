import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Alert, Linking, Image, ScrollView, RefreshControl } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as ExpoLinking from 'expo-linking';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type {
  ChannelVideo,
  ChannelPlaylist,
  ChannelInsight,
  ChannelSummary,
  DailyViews,
  DailySubscriberChange,
  TrendChange,
  ChannelBreakdown,
  BreakdownRow,
  SubscribedStatusBreakdown,
  RootStackParamList,
} from '../types';
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

/** A prominent "latest upload" callout — matches YouTube Studio's own Home dashboard spotlight
 * card. `videos` is already sorted most-recent-first by the server, so this is simply its first
 * real entry; renders nothing for a channel with zero uploads. */
function LatestVideoSpotlight({ video }: { video: ChannelVideo | undefined }) {
  if (!video) return null;
  return (
    <TouchableOpacity onPress={() => Linking.openURL(video.url)} activeOpacity={0.85}>
      <Card style={styles.spotlightCard} variant="highlight">
        <Text style={styles.spotlightLabel}>Latest upload</Text>
        <View style={styles.row}>
          <View style={styles.spotlightThumbnailWrap}>
            {video.thumbnailUrl ? (
              <Image source={{ uri: video.thumbnailUrl }} style={styles.thumbnail} resizeMode="cover" />
            ) : (
              <View style={styles.thumbnail} />
            )}
          </View>
          <View style={styles.cardBody}>
            <Text style={styles.cardTitle} numberOfLines={2}>
              {video.title}
            </Text>
            <Text style={styles.cardMeta}>{formatDate(video.publishedAt)}</Text>
            <View style={styles.statsRow}>
              <View style={styles.stat}>
                <Ionicons name="eye" size={14} color={colors.accent} />
                <Text style={styles.statValue}>{formatCount(video.viewCount)}</Text>
              </View>
              <View style={styles.stat}>
                <Ionicons name="heart" size={14} color={colors.accent} />
                <Text style={styles.statValue}>{formatCount(video.likeCount)}</Text>
              </View>
            </View>
          </View>
        </View>
      </Card>
    </TouchableOpacity>
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

/** A real horizontal bar list for any label→views breakdown (traffic sources, top countries) —
 * same gradient-bar mechanism as TopVideosChart, generalized. A genuinely empty list (real, not a
 * loading glitch — YouTube Analytics just has nothing to report for this window) shows honest
 * copy instead of a blank card or a fake "0" row. */
function BreakdownBarList({ title, rows, emptyText }: { title: string; rows: BreakdownRow[]; emptyText: string }) {
  if (rows.length === 0) {
    return (
      <Card style={styles.chartCard}>
        <Text style={styles.insightsTitle}>{title}</Text>
        <Text style={styles.breakdownEmptyText}>{emptyText}</Text>
      </Card>
    );
  }
  const maxViews = Math.max(...rows.map((r) => r.views), 1);
  return (
    <Card style={styles.chartCard}>
      <Text style={styles.insightsTitle}>{title}</Text>
      {rows.map((r) => (
        <View key={r.label} style={styles.chartRow}>
          <Text style={styles.chartRowTitle} numberOfLines={1}>
            {r.label}
          </Text>
          <View style={styles.chartBarTrack}>
            <LinearGradient
              colors={gradients.brand}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.chartBarFill, { width: `${Math.max(6, (r.views / maxViews) * 100)}%` }]}
            />
          </View>
          <Text style={styles.chartRowValue}>{formatCount(r.views)}</Text>
        </View>
      ))}
    </Card>
  );
}

function formatMinutes(minutes: number): string {
  if (minutes >= 60) return `${(minutes / 60).toFixed(1)}h`;
  return `${Math.round(minutes)}m`;
}

/** A real two-segment stacked bar (subscribed vs. non-subscribed views) — matches YouTube
 * Studio's Audience "Views by subscription status" chart, just as a bar instead of a pie (no
 * charting library in this app). Honest empty state when the window has zero views at all. */
function SubscribedStatusChart({ status }: { status: SubscribedStatusBreakdown }) {
  const total = status.subscribedViews + status.unsubscribedViews;
  return (
    <Card style={styles.chartCard}>
      <Text style={styles.insightsTitle}>Views by subscription status</Text>
      {total === 0 ? (
        <Text style={styles.breakdownEmptyText}>No views to break down for this period yet.</Text>
      ) : (
        <>
          <View style={styles.subStatusTrack}>
            <View style={[styles.subStatusSegment, { flex: status.subscribedViews, backgroundColor: colors.accent }]} />
            <View style={[styles.subStatusSegment, { flex: status.unsubscribedViews, backgroundColor: colors.accentAI }]} />
          </View>
          <View style={styles.subStatusLegendRow}>
            <View style={styles.subStatusLegendItem}>
              <View style={[styles.subStatusDot, { backgroundColor: colors.accent }]} />
              <Text style={styles.subStatusLegendText}>
                Subscribers · {formatCount(status.subscribedViews)} ({((status.subscribedViews / total) * 100).toFixed(0)}%)
              </Text>
            </View>
            <View style={styles.subStatusLegendItem}>
              <View style={[styles.subStatusDot, { backgroundColor: colors.accentAI }]} />
              <Text style={styles.subStatusLegendText}>
                Non-subscribers · {formatCount(status.unsubscribedViews)} ({((status.unsubscribedViews / total) * 100).toFixed(0)}%)
              </Text>
            </View>
          </View>
        </>
      )}
    </Card>
  );
}

const SPARKLINE_HEIGHT = 56;

/** Real day-by-day net subscriber change — matches YouTube Studio's Home "Channel growth" chart.
 * The public API only reports gained/lost per day (no historical absolute-count time series), so
 * this honestly shows net change per day (colored green/red by sign) rather than implying it's
 * plotting an absolute subscriber-count history it doesn't actually have. */
function SubscriberGrowthChart({ trend }: { trend: DailySubscriberChange[] | null }) {
  if (!trend || trend.length === 0) return null;
  const netTotal = trend.reduce((sum, d) => sum + d.netChange, 0);
  const maxAbs = Math.max(...trend.map((d) => Math.abs(d.netChange)), 1);
  return (
    <Card style={styles.trendCard}>
      <Text style={styles.insightsTitle}>Channel growth — last {trend.length} days</Text>
      <Text style={[styles.trendHeadlineValue, { color: netTotal >= 0 ? colors.success : colors.danger }]}>
        {netTotal >= 0 ? '+' : ''}
        {netTotal}
      </Text>
      <View style={styles.sparklineRow}>
        {trend.map((d) => (
          <View
            key={d.date}
            style={[
              styles.sparklineBar,
              {
                height: Math.max(4, (Math.abs(d.netChange) / maxAbs) * SPARKLINE_HEIGHT),
                backgroundColor: d.netChange >= 0 ? colors.success : colors.danger,
              },
            ]}
          />
        ))}
      </View>
    </Card>
  );
}

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
  // `trend` is null only when the connected account predates the yt-analytics.readonly scope —
  // once zero-filled server-side, a connected account's trend is never a true empty array again,
  // so an all-zero (but present) trend renders as real, honest (very flat) data below instead of
  // hitting this reconnect prompt.
  if (!trend) {
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

/** A real video/short/live card — extracted so both the Content tab's Videos/Shorts/Live lists
 * share exactly one card renderer instead of three near-copies. */
function VideoCard({ item }: { item: ChannelVideo }) {
  return (
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
            {item.liveBroadcastContent !== 'none' && (
              <View style={[styles.liveBadge, item.liveBroadcastContent === 'live' && styles.liveBadgeLive]}>
                <Text style={styles.liveBadgeText}>{item.liveBroadcastContent === 'live' ? 'LIVE' : 'UPCOMING'}</Text>
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
              {item.privacyStatus !== 'public' && (
                <View style={styles.privacyBadge}>
                  <Text style={styles.privacyBadgeText}>{item.privacyStatus}</Text>
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
  );
}

type ContentSubTab = 'videos' | 'shorts' | 'live' | 'playlists';
type SortBy = 'recent' | 'views';

const CONTENT_SUB_TABS: { key: ContentSubTab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'videos', label: 'Videos', icon: 'videocam' },
  { key: 'shorts', label: 'Shorts', icon: 'flash' },
  { key: 'live', label: 'Live', icon: 'radio' },
  { key: 'playlists', label: 'Playlists', icon: 'list' },
];

/**
 * Real channel-content browser — matches YouTube Studio's Content screen (Videos/Shorts/Live/
 * Playlists tabs + a sort control). Videos/Shorts are split by a real duration heuristic
 * (ChannelVideo.isShort, see server's youtube.ts); Live uses YouTube's own real
 * liveBroadcastContent field, so a channel with no live-streaming history honestly shows empty
 * rather than a fake/placeholder row.
 */
function ContentTabView({
  videos,
  playlists,
  loading,
  onRefresh,
}: {
  videos: ChannelVideo[];
  playlists: ChannelPlaylist[];
  loading: boolean;
  onRefresh: () => void;
}) {
  const [subTab, setSubTab] = useState<ContentSubTab>('videos');
  const [sortBy, setSortBy] = useState<SortBy>('recent');

  const sortedVideos = useMemo(() => {
    const filtered = videos.filter((v) => {
      if (subTab === 'live') return v.liveBroadcastContent !== 'none';
      if (v.liveBroadcastContent !== 'none') return false; // live/upcoming only shows under Live
      return subTab === 'shorts' ? v.isShort : !v.isShort;
    });
    return [...filtered].sort((a, b) =>
      sortBy === 'views' ? b.viewCount - a.viewCount : new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
    );
  }, [videos, subTab, sortBy]);

  return (
    <View style={styles.contentTabWrap}>
      <View style={styles.subTabRow}>
        {CONTENT_SUB_TABS.map((t) => (
          <TouchableOpacity
            key={t.key}
            onPress={() => setSubTab(t.key)}
            style={[styles.subTabChip, subTab === t.key && styles.subTabChipActive]}
          >
            <Ionicons name={t.icon} size={13} color={subTab === t.key ? colors.onAccent : colors.textSecondary} />
            <Text style={[styles.subTabText, subTab === t.key && styles.subTabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {subTab !== 'playlists' && (
        <View style={styles.sortRow}>
          <Text style={styles.sortLabel}>Sort:</Text>
          {(['recent', 'views'] as const).map((s) => (
            <TouchableOpacity key={s} onPress={() => setSortBy(s)} style={[styles.sortChip, sortBy === s && styles.sortChipActive]}>
              <Text style={[styles.sortChipText, sortBy === s && styles.sortChipTextActive]}>
                {s === 'recent' ? 'Most recent' : 'Views'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {subTab === 'playlists' ? (
        playlists.length === 0 ? (
          <EmptyState icon="list" title="No playlists yet" body="Playlists on this channel will show up here." />
        ) : (
          <FlatList
            data={playlists}
            keyExtractor={(p) => p.playlistId}
            refreshing={loading}
            onRefresh={onRefresh}
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
                    </View>
                    <View style={styles.cardBody}>
                      <Text style={styles.cardTitle} numberOfLines={2}>
                        {item.title}
                      </Text>
                      <View style={styles.metaRow}>
                        <Text style={styles.cardMeta}>
                          {item.itemCount} video{item.itemCount === 1 ? '' : 's'}
                        </Text>
                        {item.privacyStatus !== 'public' && (
                          <View style={styles.privacyBadge}>
                            <Text style={styles.privacyBadgeText}>{item.privacyStatus}</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  </View>
                </Card>
              </TouchableOpacity>
            )}
          />
        )
      ) : sortedVideos.length === 0 ? (
        <EmptyState
          icon={subTab === 'live' ? 'radio' : 'film'}
          title={subTab === 'live' ? 'No live activity' : `No ${subTab} yet`}
          body={
            subTab === 'live'
              ? 'Live and upcoming broadcasts on this channel will show up here.'
              : 'Nothing here yet — upload something and it will show up.'
          }
        />
      ) : (
        <FlatList
          data={sortedVideos}
          keyExtractor={(item) => item.videoId}
          refreshing={loading}
          onRefresh={onRefresh}
          renderItem={({ item }) => <VideoCard item={item} />}
        />
      )}
    </View>
  );
}

type MainTab = 'overview' | 'content';

export default function AnalyticsScreen({}: Props) {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [mainTab, setMainTab] = useState<MainTab>('overview');
  const [videos, setVideos] = useState<ChannelVideo[] | null>(null);
  const [playlists, setPlaylists] = useState<ChannelPlaylist[]>([]);
  const [insights, setInsights] = useState<ChannelInsight[]>([]);
  const [summary, setSummary] = useState<ChannelSummary | null>(null);
  const [trend, setTrend] = useState<DailyViews[] | null>(null);
  const [trendChange, setTrendChange] = useState<TrendChange | null>(null);
  const [subscriberTrend, setSubscriberTrend] = useState<DailySubscriberChange[] | null>(null);
  const [breakdown, setBreakdown] = useState<ChannelBreakdown | null>(null);
  const [subscriberCount, setSubscriberCount] = useState<number | null>(null);
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
        setPlaylists(data.playlists);
        setInsights(data.insights);
        setSummary(data.summary);
        setTrend(data.trend);
        setTrendChange(data.trendChange);
        setSubscriberTrend(data.subscriberTrend);
        setBreakdown(data.breakdown);
        setSubscriberCount(data.subscriberCount);
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
        <View style={styles.headerTextWrap}>
          <Text style={styles.title}>YouTube Performance</Text>
          {subscriberCount !== null && (
            <Text style={styles.subscriberCountText}>{formatCount(subscriberCount)} subscribers</Text>
          )}
        </View>
      </View>

      <View style={styles.mainTabRow}>
        {(['overview', 'content'] as const).map((t) => (
          <TouchableOpacity
            key={t}
            onPress={() => setMainTab(t)}
            style={[styles.mainTabButton, mainTab === t && styles.mainTabButtonActive]}
          >
            <Text style={[styles.mainTabText, mainTab === t && styles.mainTabTextActive]}>
              {t === 'overview' ? 'Overview' : 'Content'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {videos && videos.length === 0 ? (
        <EmptyState
          icon="trending-up"
          title="Nothing uploaded yet"
          body="Upload something to your channel and its real stats will show up here."
        />
      ) : mainTab === 'overview' ? (
        <ScrollView refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.accent} />}>
          <LatestVideoSpotlight video={videos?.[0]} />
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
          {breakdown && (
            <View style={styles.statTileRow}>
              <StatTile
                icon="time"
                label="Watch time"
                value={formatMinutes(breakdown.watchTime.estimatedMinutesWatched)}
                gradient={gradients.brand}
              />
              <StatTile
                icon="hourglass"
                label="Avg duration"
                value={formatDuration(breakdown.watchTime.averageViewDurationSec) || '0:00'}
                gradient={gradients.ai}
              />
              <StatTile
                icon="person-add"
                label="Net subs"
                value={`${breakdown.subscribers.gained - breakdown.subscribers.lost >= 0 ? '+' : ''}${
                  breakdown.subscribers.gained - breakdown.subscribers.lost
                }`}
                gradient={gradients.brand}
              />
            </View>
          )}
          {videos && <TopVideosChart videos={videos} />}
          {breakdown && (
            <BreakdownBarList
              title="Traffic sources"
              rows={breakdown.trafficSources}
              emptyText="No traffic-source data for this period yet."
            />
          )}
          {breakdown && (
            <BreakdownBarList
              title="Top countries"
              rows={breakdown.topCountries}
              emptyText="No geography data for this period yet."
            />
          )}
          {breakdown && (
            <BreakdownBarList
              title="Device type"
              rows={breakdown.deviceTypes}
              emptyText="No device data for this period yet."
            />
          )}
          {breakdown && <SubscribedStatusChart status={breakdown.subscribedStatus} />}
          <SubscriberGrowthChart trend={subscriberTrend} />
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
        </ScrollView>
      ) : (
        <ContentTabView videos={videos ?? []} playlists={playlists} loading={loading} onRefresh={load} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: spacing.lg, paddingTop: 60 },
  center: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
  headerTextWrap: { flex: 1 },
  title: { color: colors.textPrimary, fontSize: 18, fontWeight: '700' },
  subscriberCountText: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  mainTabRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  mainTabButton: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  mainTabButtonActive: { backgroundColor: colors.accentSurface, borderColor: colors.accent },
  mainTabText: { color: colors.textSecondary, fontSize: 13, fontWeight: '700' },
  mainTabTextActive: { color: colors.accent },
  contentTabWrap: { flex: 1 },
  subTabRow: { flexDirection: 'row', gap: 6, marginBottom: spacing.sm },
  subTabChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.sm, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  subTabChipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  subTabText: { color: colors.textSecondary, fontSize: 11, fontWeight: '600' },
  subTabTextActive: { color: colors.onAccent },
  sortRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.sm },
  sortLabel: { color: colors.textMuted, fontSize: 11 },
  sortChip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.sm, backgroundColor: colors.surface },
  sortChipActive: { backgroundColor: colors.accentSurface },
  sortChipText: { color: colors.textSecondary, fontSize: 11, fontWeight: '600' },
  sortChipTextActive: { color: colors.accent },
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
  spotlightCard: { marginBottom: spacing.md, gap: spacing.sm },
  spotlightLabel: { color: colors.accent, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  spotlightThumbnailWrap: { width: 128, height: 72, borderRadius: radius.sm, overflow: 'hidden', backgroundColor: colors.surface },
  chartCard: { marginBottom: spacing.md, gap: spacing.sm },
  chartRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chartRowTitle: { width: 90, color: colors.textSecondary, fontSize: 11 },
  chartBarTrack: { flex: 1, height: 16, borderRadius: radius.sm, backgroundColor: colors.background, overflow: 'hidden' },
  chartBarFill: { height: '100%', borderRadius: radius.sm },
  chartRowValue: { width: 44, textAlign: 'right', color: colors.textPrimary, fontSize: 12, fontWeight: '700' },
  breakdownEmptyText: { color: colors.textSecondary, fontSize: 12 },
  subStatusTrack: { flexDirection: 'row', height: 16, borderRadius: radius.sm, overflow: 'hidden', backgroundColor: colors.background },
  subStatusSegment: { height: '100%' },
  subStatusLegendRow: { gap: 6 },
  subStatusLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  subStatusDot: { width: 8, height: 8, borderRadius: 4 },
  subStatusLegendText: { color: colors.textSecondary, fontSize: 12 },
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
  liveBadge: {
    position: 'absolute',
    left: 4,
    top: 4,
    backgroundColor: colors.textMuted,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  liveBadgeLive: { backgroundColor: colors.danger },
  liveBadgeText: { color: '#FFFFFF', fontSize: 9, fontWeight: '800' },
  privacyBadge: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  privacyBadgeText: { color: colors.textSecondary, fontSize: 10, fontWeight: '600', textTransform: 'capitalize' },
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
