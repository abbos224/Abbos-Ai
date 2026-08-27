import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { Clip, RootStackParamList } from '../types';
import { getJob } from '../api';

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
        <ActivityIndicator color="#6C5CE7" />
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
              <Text style={styles.cardScore}>{item.score}</Text>
            </View>
            <Text style={styles.cardHook} numberOfLines={2}>
              &ldquo;{item.chosenHook}&rdquo;
            </Text>
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
  container: { flex: 1, backgroundColor: '#0B0B0F', padding: 20, paddingTop: 60 },
  center: { flex: 1, backgroundColor: '#0B0B0F', alignItems: 'center', justifyContent: 'center' },
  title: { color: '#fff', fontSize: 22, fontWeight: '700', marginBottom: 16 },
  card: { backgroundColor: '#16161D', borderRadius: 14, padding: 16, marginBottom: 12 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTopic: { color: '#fff', fontSize: 15, fontWeight: '600', flex: 1, marginRight: 8 },
  cardScore: { color: '#6C5CE7', fontSize: 18, fontWeight: '800' },
  cardHook: { color: '#B8B8C2', fontSize: 13, marginTop: 6, fontStyle: 'italic' },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  cardMeta: { color: '#6C6C78', fontSize: 12 },
  cardStatus: { color: '#4CD964', fontSize: 12, fontWeight: '600' },
  cardStatusFailed: { color: '#FF6B6B' },
});
