import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Card from './Card';
import { colors, gradients, spacing, radius } from '../theme';
import { formatCount } from '../utils/format';

export type BreakdownBarListRow = { label: string; views: number };

/** A real horizontal bar list for any label→views breakdown (traffic sources, top countries,
 * device type, per-video traffic sources, ...) — gradient bars sized relative to the row's own
 * max, matching this app's established no-charting-library visual language. A genuinely empty
 * list (real, not a loading glitch) shows honest copy instead of a blank card or a fake "0" row. */
export default function BreakdownBarList({
  title,
  rows,
  emptyText,
}: {
  title: string;
  rows: BreakdownBarListRow[];
  emptyText: string;
}) {
  if (rows.length === 0) {
    return (
      <Card style={styles.card}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.emptyText}>{emptyText}</Text>
      </Card>
    );
  }
  const maxViews = Math.max(...rows.map((r) => r.views), 1);
  return (
    <Card style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      {rows.map((r) => (
        <View key={r.label} style={styles.row}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {r.label}
          </Text>
          <View style={styles.barTrack}>
            <LinearGradient
              colors={gradients.brand}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.barFill, { width: `${Math.max(6, (r.views / maxViews) * 100)}%` }]}
            />
          </View>
          <Text style={styles.rowValue}>{formatCount(r.views)}</Text>
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: spacing.md, gap: spacing.sm },
  title: { color: colors.textPrimary, fontSize: 14, fontWeight: '700' },
  emptyText: { color: colors.textSecondary, fontSize: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowTitle: { width: 90, color: colors.textSecondary, fontSize: 11 },
  barTrack: { flex: 1, height: 16, borderRadius: radius.sm, backgroundColor: colors.background, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: radius.sm },
  rowValue: { width: 44, textAlign: 'right', color: colors.textPrimary, fontSize: 12, fontWeight: '700' },
});
