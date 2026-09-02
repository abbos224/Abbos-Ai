import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { Idea, RootStackParamList } from '../types';
import { getIdeaJob } from '../api';
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
        <ActivityIndicator color={colors.accent} />
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
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.cardHook}>&ldquo;{item.hook}&rdquo;</Text>
            <Text style={styles.cardScript}>{item.script}</Text>
            <Text style={styles.cardCta}>CTA: {item.cta}</Text>
            <TouchableOpacity style={styles.copyButton} onPress={() => handleCopyScript(item)}>
              <Text style={styles.copyButtonText}>Copy script</Text>
            </TouchableOpacity>
          </View>
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
  cardHook: { color: colors.textPrimary, fontSize: 15, fontWeight: '600', fontStyle: 'italic' },
  cardScript: { color: colors.textSecondary, fontSize: 13, marginTop: spacing.sm, lineHeight: 19 },
  cardCta: { color: colors.accent, fontSize: 12, fontWeight: '600', marginTop: spacing.sm },
  copyButton: {
    marginTop: spacing.md,
    backgroundColor: colors.accentSurface,
    borderRadius: radius.md,
    paddingVertical: 10,
    alignItems: 'center',
  },
  copyButtonText: { color: colors.accent, fontSize: 13, fontWeight: '600' },
});
