import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Alert, Linking } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AnalyticsEntry, RootStackParamList } from '../types';
import { getYoutubeAnalytics, getYoutubeStatus } from '../api';
import { colors, radius, spacing } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Analytics'>;

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export default function AnalyticsScreen({}: Props) {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [entries, setEntries] = useState<AnalyticsEntry[] | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    getYoutubeStatus()
      .then(async (status) => {
        setConnected(status.connected);
        if (!status.connected) {
          setEntries([]);
          return;
        }
        const data = await getYoutubeAnalytics();
        setEntries([...data].sort((a, b) => b.viewCount - a.viewCount));
      })
      .catch((err) => Alert.alert('Failed to load analytics', err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(load);

  if (loading && entries === null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (connected === false) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>YouTube not connected</Text>
        <Text style={styles.emptyBody}>Connect your channel from a clip's Preview screen to see performance here.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>YouTube performance</Text>

      {entries && entries.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Nothing published yet</Text>
          <Text style={styles.emptyBody}>Publish a clip from its Preview screen and its stats will show up here.</Text>
        </View>
      ) : (
        <FlatList
          data={entries ?? []}
          keyExtractor={(item) => item.clipId}
          refreshing={loading}
          onRefresh={load}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.card} onPress={() => Linking.openURL(item.url)}>
              <Text style={styles.cardTopic} numberOfLines={1}>
                {item.topic}
              </Text>
              <Text style={styles.cardHook} numberOfLines={1}>
                &ldquo;{item.chosenHook}&rdquo;
              </Text>
              <View style={styles.statsRow}>
                <View style={styles.stat}>
                  <Text style={styles.statValue}>{formatCount(item.viewCount)}</Text>
                  <Text style={styles.statLabel}>views</Text>
                </View>
                <View style={styles.stat}>
                  <Text style={styles.statValue}>{formatCount(item.likeCount)}</Text>
                  <Text style={styles.statLabel}>likes</Text>
                </View>
                <View style={styles.stat}>
                  <Text style={styles.statValue}>{formatCount(item.commentCount)}</Text>
                  <Text style={styles.statLabel}>comments</Text>
                </View>
              </View>
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
  title: { color: colors.textPrimary, fontSize: 20, fontWeight: '600', marginBottom: spacing.md },
  emptyState: { marginTop: spacing.xl, alignItems: 'center' },
  emptyTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: '600', marginBottom: spacing.xs, textAlign: 'center' },
  emptyBody: { color: colors.textSecondary, fontSize: 13, textAlign: 'center', lineHeight: 19 },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  cardTopic: { color: colors.textPrimary, fontSize: 15, fontWeight: '600' },
  cardHook: { color: colors.textSecondary, fontSize: 13, marginTop: 4, fontStyle: 'italic' },
  statsRow: { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  stat: { alignItems: 'flex-start' },
  statValue: { color: colors.accent, fontSize: 16, fontWeight: '700' },
  statLabel: { color: colors.textMuted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4 },
});
