import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Alert, Linking } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AnalyticsEntry, RootStackParamList } from '../types';
import { getYoutubeAnalytics, getYoutubeStatus } from '../api';
import Card from '../components/Card';
import IconBadge from '../components/IconBadge';
import EmptyState from '../components/EmptyState';
import { colors, spacing } from '../theme';

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
        <EmptyState
          icon="logo-youtube"
          title="YouTube not connected"
          body="Connect your channel from a clip's Preview screen to see performance here."
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

      {entries && entries.length === 0 ? (
        <EmptyState
          icon="trending-up"
          title="Nothing published yet"
          body="Publish a clip from its Preview screen and its stats will show up here."
        />
      ) : (
        <FlatList
          data={entries ?? []}
          keyExtractor={(item) => item.clipId}
          refreshing={loading}
          onRefresh={load}
          renderItem={({ item }) => (
            <TouchableOpacity onPress={() => Linking.openURL(item.url)} activeOpacity={0.85}>
              <Card style={styles.card}>
                <Text style={styles.cardTopic} numberOfLines={1}>
                  {item.topic}
                </Text>
                <Text style={styles.cardHook} numberOfLines={1}>
                  &ldquo;{item.chosenHook}&rdquo;
                </Text>
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
  card: { marginBottom: spacing.sm },
  cardTopic: { color: colors.textPrimary, fontSize: 15, fontWeight: '600' },
  cardHook: { color: colors.textSecondary, fontSize: 13, marginTop: 4, fontStyle: 'italic' },
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
