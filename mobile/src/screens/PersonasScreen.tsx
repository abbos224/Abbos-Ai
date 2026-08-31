import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, ScrollView } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { Persona, PersonaName, RootStackParamList } from '../types';
import { getPersonas, setActivePersona } from '../api';
import { colors, radius, spacing } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Personas'>;

export default function PersonasScreen({}: Props) {
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [activePersona, setActive] = useState<PersonaName | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<PersonaName | 'none' | null>(null);

  useEffect(() => {
    getPersonas()
      .then(({ personas, activePersona }) => {
        setPersonas(personas);
        setActive(activePersona);
      })
      .catch((err) => Alert.alert('Failed to load personas', err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, []);

  async function pick(name: PersonaName | null) {
    setSaving(name ?? 'none');
    try {
      const { activePersona } = await setActivePersona(name);
      setActive(activePersona);
    } catch (err) {
      Alert.alert('Save failed', err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(null);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>Voice</Text>
      <Text style={styles.sectionHint}>
        Steers the tone of every hook, CTA, and cover title Claude writes for your next uploads. Doesn't
        change clips you've already generated.
      </Text>

      <TouchableOpacity
        style={[styles.card, activePersona === null && styles.cardActive]}
        onPress={() => pick(null)}
        disabled={saving !== null}
      >
        <View style={styles.cardHeader}>
          <Text style={[styles.cardLabel, activePersona === null && styles.cardLabelActive]}>Default</Text>
          {saving === 'none' && <ActivityIndicator size="small" color={colors.accent} />}
        </View>
        <Text style={[styles.cardDescription, activePersona === null && styles.cardDescriptionActive]}>
          No persona override — Claude's neutral, general-purpose voice.
        </Text>
      </TouchableOpacity>

      {personas.map((persona) => {
        const isActive = activePersona === persona.name;
        return (
          <TouchableOpacity
            key={persona.name}
            style={[styles.card, isActive && styles.cardActive]}
            onPress={() => pick(persona.name)}
            disabled={saving !== null}
          >
            <View style={styles.cardHeader}>
              <Text style={[styles.cardLabel, isActive && styles.cardLabelActive]}>{persona.label}</Text>
              {saving === persona.name && <ActivityIndicator size="small" color={colors.accent} />}
            </View>
            <Text style={[styles.cardDescription, isActive && styles.cardDescriptionActive]}>
              {persona.description}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  sectionTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: '600' },
  sectionHint: { color: colors.textSecondary, fontSize: 13, marginTop: 4, marginBottom: spacing.md, lineHeight: 18 },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  cardActive: { backgroundColor: colors.accentSurface, borderColor: colors.accent },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardLabel: { color: colors.textPrimary, fontSize: 15, fontWeight: '600' },
  cardLabelActive: { color: colors.accent },
  cardDescription: { color: colors.textSecondary, fontSize: 13, marginTop: 4, lineHeight: 18 },
  cardDescriptionActive: { color: colors.textPrimary },
});
