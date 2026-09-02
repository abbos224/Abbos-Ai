import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, SectionList, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { CalendarEntry, RootStackParamList } from '../types';
import { autoScheduleCalendar, getCalendar, getJob } from '../api';
import Card from '../components/Card';
import IconBadge from '../components/IconBadge';
import EmptyState from '../components/EmptyState';
import { colors, radius, spacing } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Calendar'>;

type Section = { title: string; data: CalendarEntry[] };

function formatDateLabel(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function groupByDate(entries: CalendarEntry[]): Section[] {
  const byDate = new Map<string, CalendarEntry[]>();
  for (const entry of entries) {
    const list = byDate.get(entry.scheduledFor) ?? [];
    list.push(entry);
    byDate.set(entry.scheduledFor, list);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, data]) => ({ title: formatDateLabel(date), data }));
}

export default function CalendarScreen({ navigation }: Props) {
  const [entries, setEntries] = useState<CalendarEntry[] | null>(null);
  const [autoScheduling, setAutoScheduling] = useState(false);
  const [openingClip, setOpeningClip] = useState<string | null>(null);

  const load = useCallback(() => {
    getCalendar()
      .then(setEntries)
      .catch((err) => Alert.alert('Failed to load calendar', err instanceof Error ? err.message : String(err)));
  }, []);

  useFocusEffect(load);

  async function handleAutoSchedule() {
    setAutoScheduling(true);
    try {
      await autoScheduleCalendar();
      load();
    } catch (err) {
      Alert.alert('Auto-schedule failed', err instanceof Error ? err.message : String(err));
    } finally {
      setAutoScheduling(false);
    }
  }

  async function openClip(entry: CalendarEntry) {
    setOpeningClip(entry.clipId);
    try {
      const job = await getJob(entry.jobId);
      const clip = job.clips.find((c) => c.id === entry.clipId);
      if (!clip) {
        Alert.alert('Clip not found', 'This clip no longer exists.');
        return;
      }
      navigation.navigate('Preview', { clip });
    } catch (err) {
      Alert.alert('Failed to open clip', err instanceof Error ? err.message : String(err));
    } finally {
      setOpeningClip(null);
    }
  }

  if (!entries) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <IconBadge icon="calendar" color={colors.accent} size={40} />
        <Text style={styles.title}>Content Calendar</Text>
        <TouchableOpacity onPress={handleAutoSchedule} disabled={autoScheduling} style={styles.autoScheduleButton}>
          {autoScheduling ? (
            <ActivityIndicator size="small" color={colors.accent} />
          ) : (
            <>
              <Ionicons name="sparkles" size={14} color={colors.accent} />
              <Text style={styles.autoScheduleLink}>Auto-schedule</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {entries.length === 0 ? (
        <Card variant="highlight" style={styles.emptyCard}>
          <EmptyState
            icon="calendar-outline"
            title="Nothing scheduled yet"
            body="Schedule a rendered clip from its preview screen, or tap Auto-schedule to space out everything you have ready."
          />
        </Card>
      ) : (
        <SectionList
          sections={groupByDate(entries)}
          keyExtractor={(item) => item.clipId}
          renderSectionHeader={({ section }) => <Text style={styles.sectionHeader}>{section.title}</Text>}
          renderItem={({ item }) => (
            <TouchableOpacity onPress={() => openClip(item)} disabled={openingClip === item.clipId} activeOpacity={0.85}>
              <Card style={styles.card}>
                <Text style={styles.cardTopic} numberOfLines={1}>
                  {item.topic}
                </Text>
                <Text style={styles.cardHook} numberOfLines={2}>
                  &ldquo;{item.chosenHook}&rdquo;
                </Text>
                {openingClip === item.clipId && (
                  <ActivityIndicator size="small" color={colors.accent} style={styles.cardSpinner} />
                )}
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
  center: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md, gap: spacing.md },
  title: { flex: 1, color: colors.textPrimary, fontSize: 18, fontWeight: '700' },
  autoScheduleButton: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  autoScheduleLink: { color: colors.accent, fontSize: 13, fontWeight: '600' },
  emptyCard: { borderStyle: 'dashed', marginTop: spacing.md },
  sectionHeader: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  card: { marginBottom: spacing.sm },
  cardTopic: { color: colors.textPrimary, fontSize: 15, fontWeight: '600' },
  cardHook: { color: colors.textSecondary, fontSize: 13, marginTop: 6, fontStyle: 'italic' },
  cardSpinner: { marginTop: 6 },
});
