import fs from 'node:fs';
import { getAnthropicClient } from './anthropicClient.js';
import { env } from './env.js';
import type { Word } from './transcription.js';

export type BrollMoment = { start: number; end: number; keyword: string };

/**
 * Asks Claude which (if any) 1.5-3.5s windows in this clip would benefit from a B-roll cutaway —
 * a concrete visual noun mentioned in speech (a place, an object, an action) — plus a short stock
 * footage search term for it. Returns an empty array for clips that read better as continuous
 * talking-head (the common case for personal/emotional moments), never forces a cutaway.
 */
export async function suggestBrollMoments(words: Word[], clipDurationSec: number): Promise<BrollMoment[]> {
  if (words.length === 0) return [];
  const transcript = words.map((w) => `[${w.start.toFixed(1)}] ${w.text}`).join(' ');

  const message = await getAnthropicClient().messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 1024,
    system:
      'You find moments in a short video transcript where a B-roll cutaway (stock footage ' +
      'covering a concrete visual noun — a place, object, or action mentioned in speech) would ' +
      "genuinely help, not just moments where SOME noun exists. Most clips need zero or one; " +
      'personal, emotional, or reaction-driven moments usually need none at all — a talking face ' +
      'is more compelling there than a cutaway. Respond with ONLY valid JSON: ' +
      '{ "moments": [ { "start_sec": number, "end_sec": number, "keyword": string } ] }. ' +
      'end_sec - start_sec must be between 1.5 and 3.5. "keyword" is 2-4 words for a stock video ' +
      `search (e.g. "dubai skyline", "office handshake"). Return at most 2 moments. Clip is ` +
      `${clipDurationSec.toFixed(1)}s long; only suggest windows fully inside it.`,
    messages: [{ role: 'user', content: transcript }],
  });

  const textBlock = message.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') return [];

  const jsonText = textBlock.text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try {
    const parsed: { moments: Array<{ start_sec: number; end_sec: number; keyword: string }> } =
      JSON.parse(jsonText);
    return (parsed.moments ?? [])
      .filter((m) => m.end_sec > m.start_sec && m.start_sec >= 0 && m.end_sec <= clipDurationSec)
      .map((m) => ({ start: m.start_sec, end: m.end_sec, keyword: m.keyword }));
  } catch {
    return [];
  }
}

type PexelsVideoFile = { link: string; width: number; height: number; quality: string };
type PexelsVideo = { video_files: PexelsVideoFile[]; duration: number };
type PexelsSearchResponse = { videos: PexelsVideo[] };

/** Searches Pexels for a portrait-friendly stock clip matching `keyword`. Returns a direct MP4
 * download URL, or null if no key is configured or nothing suitable was found. */
export async function searchPexelsVideo(keyword: string): Promise<string | null> {
  if (!env.pexelsApiKey) return null;

  const res = await fetch(
    `https://api.pexels.com/videos/search?query=${encodeURIComponent(keyword)}&orientation=portrait&per_page=5`,
    { headers: { Authorization: env.pexelsApiKey } },
  );
  if (!res.ok) return null;

  const data = (await res.json()) as PexelsSearchResponse;
  const video = data.videos.find((v) => v.duration >= 2);
  if (!video) return null;

  // Prefer a moderate-resolution HD file over the largest available — plenty for a 1080x1920
  // cutaway and much faster to download than a 4K master.
  const file =
    video.video_files.find((f) => f.height >= 1280 && f.height <= 1920 && f.quality !== 'sd') ??
    video.video_files.find((f) => f.quality === 'hd') ??
    video.video_files[0];

  return file?.link ?? null;
}

export async function downloadBroll(url: string, destPath: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok || !res.body) {
    throw new Error(`Failed to download B-roll: ${res.status}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(destPath, buffer);
}
