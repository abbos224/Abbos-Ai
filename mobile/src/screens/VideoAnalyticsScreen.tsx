import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, ActivityIndicator, Alert, Linking, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList, VideoAnalytics } from '../types';
import { getVideoAnalytics } from '../api';
import Card from '../components/Card';
import BreakdownBarList from '../components/BreakdownBarList';
import { colors, spacing, radius } from '../theme';
import { formatCount, formatDuration, formatDate } from '../utils/format';

type Props = NativeStackScreenProps<RootStackParamList, 'VideoAnalytics'>;

const RETENTION_HEIGHT = 64;

/**
 * Real audience-retention curve for this video — the actual mechanism behind YouTube Studio's own
 * per-video retention graph (elapsedVideoTimeRatio dimension + audienceWatchRatio metric, verified
 * against the real connected account). elapsedRatio points are evenly spaced (0-100% of the
 * video's own length) so, unlike the sparse day-by-day trend below, adjacent bars here are
 * honestly comparable. A video with too few views for YouTube to compute this gets a real
 * "not enough data yet" empty state, not a flat fake line.
 */
function RetentionChart({ points }: { points: VideoAnalytics['retentionCurve'] }) {
  if (points.length === 0) {
    return (
      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Audience retention</Text>
        <Text style={styles.emptyText}>Not enough views yet for YouTube to compute a retention curve.</Text>
      </Card>
    );
  }
  const maxRatio = Math.max(...points.map((p) => p.audienceWatchRatio), 0.01);
  const avgRelative = points.reduce((sum, p) => sum + p.relativeRetentionPerformance, 0) / points.length;
  return (
    <Card style={styles.card}>
      <Text style={styles.cardTitle}>Audience retention</Text>
      <Text style={styles.retentionHeadline}>{(avgRelative * 100).toFixed(0)}%</Text>
      <Text style={styles.retentionSubtext}>average retention vs. similar-length YouTube videos</Text>
      <View style={styles.retentionRow}>
        {points.map((p) => (
          <View
            key={p.elapsedRatio}
            style={[styles.retentionBar, { height: Math.max(2, (p.audienceWatchRatio / maxRatio) * RETENTION_HEIGHT) }]}
          />
        ))}
      </View>
      <View style={styles.retentionAxisRow}>
        <Text style={styles.retentionAxisText}>0%</Text>
        <Text style={styles.retentionAxisText}>50%</Text>
        <Text style={styles.retentionAxisText}>100%</Text>
      </View>
    </Card>
  );
}

/**
 * Real day-by-day views for this specific video. Deliberately a list, not a bar chart — the
 * server does NOT zero-fill this (unlike the channel-wide trend), since a video's real active
 * days are usually a handful spread across a potentially long lifetime; rendering that as evenly
 * spaced adjacent bars would falsely imply those days were consecutive.
 */
function VideoTrendList({ trend }: { trend: VideoAnalytics['trend'] }) {
  if (trend.length === 0) return null;
  return (
    <Card style={styles.card}>
      <Text style={styles.cardTitle}>Views by day</Text>
      {trend.map((d) => (
        <View key={d.date} style={styles.trendRow}>
          <Text style={styles.trendDate}>{formatDate(d.date)}</Text>
          <Text style={styles.trendViews}>{formatCount(d.views)} views</Text>
        </View>
      ))}
    </Card>
  );
}

export default function VideoAnalyticsScreen({ route }: Props) {
  const { video } = route.params;
  const [data, setData] = useState<VideoAnalytics | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    getVideoAnalytics(video.videoId)
      .then(setData)
      .catch((err) => Alert.alert('Failed to load video analytics', err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [video.videoId]);

  useFocusEffect(load);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity onPress={() => Linking.openURL(video.url)} activeOpacity={0.85}>
        <Card style={styles.card}>
          <View style={styles.headerRow}>
            <View style={styles.thumbnailWrap}>
              {video.thumbnailUrl ? (
                <Image source={{ uri: video.thumbnailUrl }} style={styles.thumbnail} resizeMode="cover" />
              ) : (
                <View style={styles.thumbnail} />
              )}
            </View>
            <View style={styles.headerBody}>
              <Text style={styles.videoTitle} numberOfLines={2}>
                {video.title}
              </Text>
              <Text style={styles.videoMeta}>{formatDate(video.publishedAt)}</Text>
            </View>
          </View>
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Ionicons name="eye" size={14} color={colors.accent} />
              <Text style={styles.statValue}>{formatCount(video.viewCount)}</Text>
            </View>
            <View style={styles.stat}>
              <Ionicons name="heart" size={14} color={colors.accent} />
              <Text style={styles.statValue}>{formatCount(video.likeCount)}</Text>
            </View>
            <View style={styles.stat}>
              <Ionicons name="chatbubble" size={14} color={colors.accent} />
              <Text style={styles.statValue}>{formatCount(video.commentCount)}</Text>
            </View>
            {video.durationSec > 0 && (
              <View style={styles.stat}>
                <Ionicons name="time" size={14} color={colors.accent} />
                <Text style={styles.statValue}>{formatDuration(video.durationSec)}</Text>
              </View>
            )}
          </View>
        </Card>
      </TouchableOpacity>

      {loading && !data ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : data ? (
        <>
          <RetentionChart points={data.retentionCurve} />
          <BreakdownBarList
            title="Traffic sources"
            rows={data.trafficSources}
            emptyText="No traffic-source data for this video yet."
          />
          <VideoTrendList trend={data.trend} />
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  center: { paddingVertical: spacing.xl, alignItems: 'center' },
  card: { marginBottom: spacing.md, gap: spacing.sm },
  cardTitle: { color: colors.textPrimary, fontSize: 14, fontWeight: '700' },
  emptyText: { color: colors.textSecondary, fontSize: 12 },
  headerRow: { flexDirection: 'row', gap: spacing.sm },
  thumbnailWrap: { width: 128, height: 72, borderRadius: radius.sm, overflow: 'hidden', backgroundColor: colors.surface },
  thumbnail: { width: '100%', height: '100%' },
  headerBody: { flex: 1, justifyContent: 'center' },
  videoTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: '700' },
  videoMeta: { color: colors.textMuted, fontSize: 11, marginTop: 4 },
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
  retentionHeadline: { color: colors.textPrimary, fontSize: 28, fontWeight: '800' },
  retentionSubtext: { color: colors.textSecondary, fontSize: 11, marginTop: -8 },
  retentionRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 1, height: RETENTION_HEIGHT, marginTop: spacing.xs },
  retentionBar: { flex: 1, backgroundColor: colors.accent, borderRadius: 1, minWidth: 1 },
  retentionAxisRow: { flexDirection: 'row', justifyContent: 'space-between' },
  retentionAxisText: { color: colors.textMuted, fontSize: 10 },
  trendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  trendDate: { color: colors.textSecondary, fontSize: 12 },
  trendViews: { color: colors.textPrimary, fontSize: 12, fontWeight: '600' },
});
