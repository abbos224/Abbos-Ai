import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { Clip, RootStackParamList } from '../types';
import { getJob } from '../api';
import { colors, radius, spacing } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Results'>;

export default function ResultsScreen({ route, navigation }: Props) {
  const { jobId } = route.params;
  const [clips, setClips] = useState<Clip[] | null>(null);

  useEffect(() => {
    getJob(jobId).then((job) => setClips(job.clips));
  }, [jobId]);

  if (!clips) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{clips.length} Reels generated</Text>
      <FlatList
        data={[...clips].sort((a, b) => b.score - a.score)}
        keyExtractor={(clip) => clip.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            disabled={item.status !== 'done'}
            onPress={() => navigation.navigate('Preview', { clip: item })}
          >
            <View style={styles.cardHeader}>
              <Text style={styles.cardTopic} numberOfLines={1}>
                {item.topic}
              </Text>
              <View style={styles.scorePill}>
                <Text style={styles.scorePillText}>{item.score}</Text>
              </View>
            </View>
            <Text style={styles.cardHook} numberOfLines={2}>
              &ldquo;{item.chosenHook}&rdquo;
            </Text>
            {item.cta && (
              <Text style={styles.cardCta} numberOfLines={1}>
                CTA: {item.cta}
              </Text>
            )}
            <View style={styles.cardFooter}>
              <Text style={styles.cardMeta}>
                {(item.endTime - item.startTime).toFixed(0)}s
              </Text>
              <Text style={[styles.cardStatus, item.status === 'failed' && styles.cardStatusFailed]}>
                {item.status}
              </Text>
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: spacing.lg, paddingTop: 60 },
  center: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.textPrimary, fontSize: 20, fontWeight: '600', marginBottom: spacing.md },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTopic: { color: colors.textPrimary, fontSize: 15, fontWeight: '600', flex: 1, marginRight: spacing.sm },
  scorePill: {
    backgroundColor: colors.accentSurface,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  scorePillText: { color: colors.accent, fontSize: 13, fontWeight: '700' },
  cardHook: { color: colors.textSecondary, fontSize: 13, marginTop: 6, fontStyle: 'italic' },
  cardCta: { color: colors.accent, fontSize: 11, fontWeight: '600', marginTop: 6 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm },
  cardMeta: { color: colors.textMuted, fontSize: 12 },
  cardStatus: { color: colors.success, fontSize: 12, fontWeight: '600' },
  cardStatusFailed: { color: colors.danger },
});
