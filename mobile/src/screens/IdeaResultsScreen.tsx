import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { Idea, RootStackParamList } from '../types';
import { getIdeaJob } from '../api';
import Card from '../components/Card';
import { colors, radius, spacing } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'IdeaResults'>;

export default function IdeaResultsScreen({ route }: Props) {
  const { ideaJobId } = route.params;
  const [topic, setTopic] = useState<string | null>(null);
  const [ideas, setIdeas] = useState<Idea[] | null>(null);

  useEffect(() => {
    getIdeaJob(ideaJobId).then((job) => {
      setTopic(job.topic);
      setIdeas(job.ideas);
    });
  }, [ideaJobId]);

  async function handleCopyScript(idea: Idea) {
    const text = `${idea.hook}\n\n${idea.script}\n\n${idea.cta}`;
    await Clipboard.setStringAsync(text);
    Alert.alert('Copied', 'Script copied — paste it into your notes or teleprompter app.');
  }

  if (!ideas) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accentAI} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        {ideas.length} ideas{topic ? ` for "${topic}"` : ''}
      </Text>
      <FlatList
        data={ideas}
        keyExtractor={(idea) => idea.id}
        renderItem={({ item, index }) => (
          <Card style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.numberBadge}>
                <Text style={styles.numberBadgeText}>{String(index + 1).padStart(2, '0')}</Text>
              </View>
              <Text style={styles.cardHook}>&ldquo;{item.hook}&rdquo;</Text>
            </View>
            <Text style={styles.cardScript}>{item.script}</Text>
            <Text style={styles.cardCta}>CTA: {item.cta}</Text>
            <TouchableOpacity style={styles.copyButton} onPress={() => handleCopyScript(item)} activeOpacity={0.85}>
              <Ionicons name="copy-outline" size={16} color={colors.accentAI} style={styles.copyIcon} />
              <Text style={styles.copyButtonText}>Copy script</Text>
            </TouchableOpacity>
          </Card>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: spacing.lg, paddingTop: 60 },
  center: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.textPrimary, fontSize: 20, fontWeight: '600', marginBottom: spacing.md },
  card: { marginBottom: spacing.sm },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  numberBadge: {
    backgroundColor: colors.accentSurface,
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  numberBadgeText: { color: colors.accentAI, fontSize: 12, fontWeight: '700' },
  cardHook: { color: colors.textPrimary, fontSize: 15, fontWeight: '600', fontStyle: 'italic', flex: 1 },
  cardScript: { color: colors.textSecondary, fontSize: 13, marginTop: spacing.sm, lineHeight: 19 },
  cardCta: { color: colors.accent, fontSize: 12, fontWeight: '600', marginTop: spacing.sm },
  copyButton: {
    flexDirection: 'row',
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.accentAI,
    borderRadius: radius.md,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copyIcon: { marginRight: 6 },
  copyButtonText: { color: colors.accentAI, fontSize: 13, fontWeight: '600' },
});
