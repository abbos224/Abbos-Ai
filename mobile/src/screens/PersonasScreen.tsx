import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { Persona, PersonaName, RootStackParamList } from '../types';
import { getPersonas, setActivePersona } from '../api';
import Card from '../components/Card';
import { colors, spacing } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Personas'>;

const PERSONA_ICONS: Record<PersonaName, keyof typeof Ionicons.glyphMap> = {
  trustedAdvisor: 'shield-checkmark',
  boldContrarian: 'flash',
  friendlyNeighbor: 'happy',
  luxuryConcierge: 'diamond',
  energeticCoach: 'flame',
};

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

      <TouchableOpacity onPress={() => pick(null)} disabled={saving !== null} activeOpacity={0.85}>
        <Card variant={activePersona === null ? 'highlight' : 'default'} style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={[styles.iconCircle, activePersona === null && styles.iconCircleActive]}>
              <Ionicons name="radio-button-off" size={16} color={activePersona === null ? colors.onAccent : colors.textMuted} />
            </View>
            <Text style={[styles.cardLabel, activePersona === null && styles.cardLabelActive]}>Default</Text>
            {saving === 'none' && <ActivityIndicator size="small" color={colors.accent} />}
          </View>
          <Text style={[styles.cardDescription, activePersona === null && styles.cardDescriptionActive]}>
            No persona override — Claude's neutral, general-purpose voice.
          </Text>
        </Card>
      </TouchableOpacity>

      {personas.map((persona) => {
        const isActive = activePersona === persona.name;
        return (
          <TouchableOpacity key={persona.name} onPress={() => pick(persona.name)} disabled={saving !== null} activeOpacity={0.85}>
            <Card variant={isActive ? 'highlight' : 'default'} style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={[styles.iconCircle, isActive && styles.iconCircleActive]}>
                  <Ionicons name={PERSONA_ICONS[persona.name]} size={16} color={isActive ? colors.onAccent : colors.textMuted} />
                </View>
                <Text style={[styles.cardLabel, isActive && styles.cardLabelActive]}>{persona.label}</Text>
                {saving === persona.name && <ActivityIndicator size="small" color={colors.accent} />}
              </View>
              <Text style={[styles.cardDescription, isActive && styles.cardDescriptionActive]}>{persona.description}</Text>
            </Card>
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
  card: { marginBottom: spacing.sm },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  iconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircleActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  cardLabel: { flex: 1, color: colors.textPrimary, fontSize: 15, fontWeight: '600' },
  cardLabelActive: { color: colors.accent },
  cardDescription: { color: colors.textSecondary, fontSize: 13, marginTop: spacing.sm, lineHeight: 18 },
  cardDescriptionActive: { color: colors.textPrimary },
});
