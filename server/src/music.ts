import fs from 'node:fs';
import { getAnthropicClient } from './anthropicClient.js';
import { env } from './env.js';

export type Mood = 'business' | 'motivational' | 'lifestyle' | 'luxury' | 'educational' | 'funny';

const MOOD_TAGS: Record<Mood, string> = {
  business: 'corporate',
  motivational: 'uplifting',
  lifestyle: 'chill',
  luxury: 'elegant',
  educational: 'calm',
  funny: 'quirky',
};

const MOODS = Object.keys(MOOD_TAGS) as Mood[];

/** Asks Claude to classify a clip's mood from its topic/hook/CTA, for background-music selection. */
export async function classifyMood(topic: string, hook: string, cta = ''): Promise<Mood> {
  const message = await getAnthropicClient().messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 20,
    system:
      'Classify the mood of a short-form video clip, for background music selection. Respond ' +
      `with ONLY one word, exactly one of: ${MOODS.join(', ')}. No punctuation, no explanation.`,
    messages: [{ role: 'user', content: `Topic: ${topic}\nHook: ${hook}\nCTA: ${cta}` }],
  });

  const textBlock = message.content.find((b) => b.type === 'text');
  const word = textBlock?.type === 'text' ? textBlock.text.trim().toLowerCase() : '';
  return (MOODS as string[]).includes(word) ? (word as Mood) : 'business';
}

type JamendoTrack = { audio: string; audiodownload_allowed: boolean; duration: number };
type JamendoResponse = { results: JamendoTrack[] };

/**
 * Searches Jamendo (Creative Commons music) for a track matching the mood, preferring one at
 * least as long as the clip. Returns null if no key is configured or nothing is found at all —
 * callers should treat missing music as "skip it", never as a reason to fail the render.
 */
export async function searchMoodTrack(mood: Mood, minDurationSec: number): Promise<string | null> {
  if (!env.jamendoClientId) return null;

  const tag = MOOD_TAGS[mood];
  const res = await fetch(
    `https://api.jamendo.com/v3.0/tracks/?client_id=${env.jamendoClientId}&format=json&limit=10` +
      `&fuzzytags=${encodeURIComponent(tag)}&audiodownload_allowed=true&order=popularity_total`,
  );
  if (!res.ok) return null;

  const data = (await res.json()) as JamendoResponse;
  const longEnough = data.results.find((t) => t.audiodownload_allowed && t.duration >= minDurationSec);
  return longEnough?.audio ?? data.results[0]?.audio ?? null;
}

export async function downloadTrack(url: string, destPath: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download track: ${res.status}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(destPath, buffer);
}
