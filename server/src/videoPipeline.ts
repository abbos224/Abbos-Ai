import fs from 'node:fs';
import path from 'node:path';
import { v4 as uuid } from 'uuid';
import { runFfmpeg, probe, escapeFfmpegFilterPath } from './ffmpegRunner.js';
import { buildAssFile, buildCaptionCues, staticFallbackFor, type CaptionCue, type WordFormatOverride } from './ass.js';
import { translateCaptions } from './translate.js';
import { groupIntoSpeakerTurns, detectSpeakerPositions, type SpeakerTurn } from './speakerFraming.js';
import { getBrandKit } from './brandKit.js';
import { getActivePersona } from './personas.js';
import { suggestBrollMoments, searchPexelsVideo, downloadBroll } from './broll.js';
import { classifyMood, searchMoodTrack, downloadTrack } from './music.js';
import { regenerateCreative } from './regenerate.js';
import { buildSoundEffectCues, applySoundEffects } from './soundEffects.js';
import type { Word } from './transcription.js';
import type { Clip, RegenerateModifier, SocialCaption } from './store.js';
import { env } from './env.js';

type SilenceInterval = { start: number; end: number };

/** Cuts [start, end] out of the source video into a new file, clip-relative (starts at t=0). */
async function cutSegment(source: string, start: number, end: number, outPath: string) {
  await runFfmpeg([
    '-ss', start.toFixed(3),
    '-i', source,
    '-t', (end - start).toFixed(3),
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
    '-c:a', 'aac',
    outPath,
  ]);
}

/** Runs ffmpeg silencedetect on a clip-relative file and returns detected silence intervals. */
async function detectSilences(filePath: string): Promise<SilenceInterval[]> {
  const stderr = await runFfmpeg([
    '-i', filePath,
    '-af', 'silencedetect=noise=-30dB:d=0.6',
    '-f', 'null', '-',
  ]);

  const intervals: SilenceInterval[] = [];
  let pendingStart: number | undefined;

  for (const line of stderr.split('\n')) {
    const startMatch = line.match(/silence_start:\s*([\d.]+)/);
    const endMatch = line.match(/silence_end:\s*([\d.]+)/);
    if (startMatch) pendingStart = parseFloat(startMatch[1]);
    if (endMatch && pendingStart !== undefined) {
      intervals.push({ start: pendingStart, end: parseFloat(endMatch[1]) });
      pendingStart = undefined;
    }
  }
  return intervals;
}

/** Builds the list of [start,end] segments to KEEP, given detected silences and total duration. */
function keepSegments(silences: SilenceInterval[], duration: number): SilenceInterval[] {
  const segments: SilenceInterval[] = [];
  let cursor = 0;
  for (const silence of silences.sort((a, b) => a.start - b.start)) {
    if (silence.start - cursor > 0.05) segments.push({ start: cursor, end: silence.start });
    cursor = Math.max(cursor, silence.end);
  }
  if (duration - cursor > 0.05) segments.push({ start: cursor, end: duration });
  return segments;
}

// Deliberately conservative: only unambiguous disfluency interjections, never words like "like"
// or "you know" that are filler in some sentences but load-bearing in others.
const FILLER_WORDS = new Set(['um', 'umm', 'uhm', 'uh', 'uhh', 'erm', 'hmm']);

function normalizeWord(text: string): string {
  return text.toLowerCase().replace(/[^a-z]/g, '');
}

export function isFillerWord(text: string): boolean {
  return FILLER_WORDS.has(normalizeWord(text));
}

/**
 * Finds the time ranges of filler/disfluency words ("um", "uh", ...) in a clip-relative word
 * list, in the same [start,end] shape `detectSilences` returns, so both can be cut out together
 * in one `keepSegments`/`removeSilence` pass. Pure and unit-tested.
 */
export function findFillerWordRanges(words: Word[]): SilenceInterval[] {
  return words.filter((w) => isFillerWord(w.text)).map((w) => ({ start: w.start, end: w.end }));
}

/** Maps a time in the pre-silence-removal (clip-relative) timeline to the post-removal timeline. */
function remapTime(t: number, segments: SilenceInterval[]): number {
  let mapped = 0;
  for (const seg of segments) {
    if (t <= seg.start) break;
    mapped += Math.min(t, seg.end) - seg.start;
    if (t <= seg.end) break;
  }
  return mapped;
}

async function removeSilence(
  input: string,
  segments: SilenceInterval[],
  outPath: string,
): Promise<void> {
  if (segments.length <= 1) {
    fs.copyFileSync(input, outPath);
    return;
  }

  const filterParts: string[] = [];
  const videoLabels: string[] = [];
  const audioLabels: string[] = [];

  segments.forEach((seg, i) => {
    filterParts.push(
      `[0:v]trim=start=${seg.start}:end=${seg.end},setpts=PTS-STARTPTS[v${i}]`,
      `[0:a]atrim=start=${seg.start}:end=${seg.end},asetpts=PTS-STARTPTS[a${i}]`,
    );
    videoLabels.push(`[v${i}][a${i}]`);
  });

  const filterComplex =
    filterParts.join(';') +
    `;${videoLabels.join('')}concat=n=${segments.length}:v=1:a=1[outv][outa]`;

  await runFfmpeg([
    '-i', input,
    '-filter_complex', filterComplex,
    '-map', '[outv]', '-map', '[outa]',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
    '-c:a', 'aac',
    outPath,
  ]);
}

async function cropTo9x16(input: string, outPath: string): Promise<void> {
  const { width, height } = await probe(input);
  const targetAspect = 9 / 16;
  let cropFilter: string;

  if (width / height > targetAspect) {
    const cropWidth = Math.round(height * targetAspect / 2) * 2;
    cropFilter = `crop=${cropWidth}:${height}:(iw-${cropWidth})/2:0`;
  } else {
    const cropHeight = Math.round(width / targetAspect / 2) * 2;
    cropFilter = `crop=${width}:${cropHeight}:0:(ih-${cropHeight})/2`;
  }

  await runFfmpeg([
    '-i', input,
    '-vf', `${cropFilter},scale=1080:1920,setsar=1`,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
    '-c:a', 'copy',
    outPath,
  ]);
}

async function burnSubtitles(input: string, assPath: string, outPath: string): Promise<void> {
  await runFfmpeg([
    '-i', input,
    '-vf', `ass=${escapeFfmpegFilterPath(assPath)}`,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
    '-c:a', 'copy',
    outPath,
  ]);
}

/** Escapes text for safe use inside an ffmpeg drawtext `text=` value. Straight apostrophes are
 * swapped for a typographic one so we never have to fight drawtext's quote-escaping rules. */
function escapeDrawtext(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/%/g, '%%')
    .replace(/'/g, '’');
}

/**
 * Renders one still-frame cover image per title option: a mid-clip frame with the title drawn
 * over it in bold caps on a translucent bar, matching the "AI cover" step of the spec. `outDir` is
 * where the jpgs are written and `urlPrefix` is the `/files/`-relative path they're served under —
 * callers give each variant of a clip (original, a regeneration, ...) its own of both so they
 * never clobber each other's cover files.
 */
async function renderCovers(
  croppedPath: string,
  coverOptions: string[],
  outDir: string,
  urlPrefix: string,
): Promise<string[]> {
  if (coverOptions.length === 0) return [];

  const { durationSec } = await probe(croppedPath);
  const midpoint = durationSec / 2;
  const urls: string[] = [];

  for (let i = 0; i < coverOptions.length; i++) {
    const framePath = path.join(outDir, `cover_${i}.jpg`);
    const text = escapeDrawtext(coverOptions[i].toUpperCase());

    await runFfmpeg([
      '-ss', midpoint.toFixed(3),
      '-i', croppedPath,
      '-vf',
        `drawtext=fontfile='C\\:/Windows/Fonts/arialbd.ttf':text='${text}':fontsize=88:` +
        "fontcolor=white:line_spacing=14:box=1:boxcolor=black@0.55:boxborderw=28:" +
        'x=(w-text_w)/2:y=(h-text_h)/2',
      '-frames:v', '1',
      '-update', '1',
      framePath,
    ]);

    urls.push(`/files/${urlPrefix}/cover_${i}.jpg`);
  }

  return urls;
}

async function overlayLogo(input: string, logoPath: string, outPath: string): Promise<void> {
  await runFfmpeg([
    '-i', input,
    '-i', logoPath,
    '-filter_complex', '[1:v]scale=180:-1[logo];[0:v][logo]overlay=W-w-30:30',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
    '-c:a', 'copy',
    outPath,
  ]);
}

/** Applies the account's Brand Kit logo (top-right corner) if one is set; otherwise a plain copy. */
async function applyBrandOverlay(userId: string, input: string, outPath: string): Promise<void> {
  const brandKit = await getBrandKit(userId);
  if (brandKit.logoFile) {
    const logoPath = path.join(env.storageDir, brandKit.logoFile);
    if (fs.existsSync(logoPath)) {
      await overlayLogo(input, logoPath, outPath);
      return;
    }
  }
  fs.copyFileSync(input, outPath);
}

/**
 * Like `cropTo9x16`, but crops each speaker turn to follow that speaker's on-screen position
 * instead of one static center crop for the whole clip. Only meaningful when the source has
 * horizontal room to pan (the same `width/height > targetAspect` condition `cropTo9x16` checks) —
 * callers should fall back to `cropTo9x16` otherwise.
 */
async function cropToSpeakerFraming(
  input: string,
  turns: SpeakerTurn[],
  positions: Map<string, number>,
  outPath: string,
): Promise<void> {
  const { width, height, durationSec } = await probe(input);
  const targetAspect = 9 / 16;
  const cropWidth = Math.round((height * targetAspect) / 2) * 2;
  const maxX = width - cropWidth;

  const filterParts: string[] = [];
  const labels: string[] = [];

  turns.forEach((turn, i) => {
    const xFraction = positions.get(turn.speaker) ?? 0.5;
    const rawX = xFraction * width - cropWidth / 2;
    const x = Math.round(Math.max(0, Math.min(maxX, rawX)) / 2) * 2;
    // Extend each segment to the start of the next turn (not just this turn's own end) so any
    // silent gap between speaker turns stays on-screen instead of being dropped from the output.
    // The first/last turn is snapped to the clip's actual bounds.
    const start = i === 0 ? 0 : turn.start;
    const end = i === turns.length - 1 ? durationSec : turns[i + 1].start;

    filterParts.push(
      `[0:v]trim=start=${start}:end=${end},setpts=PTS-STARTPTS,crop=${cropWidth}:${height}:${x}:0,scale=1080:1920,setsar=1[v${i}]`,
      `[0:a]atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS[a${i}]`,
    );
    labels.push(`[v${i}][a${i}]`);
  });

  const filterComplex =
    filterParts.join(';') + `;${labels.join('')}concat=n=${turns.length}:v=1:a=1[outv][outa]`;

  await runFfmpeg([
    '-i', input,
    '-filter_complex', filterComplex,
    '-map', '[outv]', '-map', '[outa]',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
    '-c:a', 'aac',
    outPath,
  ]);
}

export type ZoomKeyframe = { start: number; end: number; scale: number };

const ZOOM_SEGMENT_DURATION = 5; // seconds per alternating step
const ZOOM_SCALE = 1.08; // subtle punch-in — enough to feel dynamic, not jarring or nauseating

/**
 * Alternates between a normal (1.0) and slightly punched-in (ZOOM_SCALE) crop every
 * ZOOM_SEGMENT_DURATION seconds, giving otherwise-static talking-head footage a sense of motion
 * (the "Automatic Zoom" spec item). Pure and unit-tested — the actual crop/scale lives in
 * `applyAutoZoom`.
 */
export function buildZoomKeyframes(durationSec: number): ZoomKeyframe[] {
  if (durationSec <= 0) return [];

  const keyframes: ZoomKeyframe[] = [];
  let t = 0;
  let i = 0;
  while (t < durationSec) {
    const end = Math.min(t + ZOOM_SEGMENT_DURATION, durationSec);
    keyframes.push({ start: t, end, scale: i % 2 === 0 ? 1.0 : ZOOM_SCALE });
    t = end;
    i++;
  }
  return keyframes;
}

export type BrollSegment = { start: number; end: number; brollPath: string };
export type TimelineSegment = { type: 'main' | 'broll'; start: number; end: number; brollPath?: string };

/**
 * Interleaves B-roll windows into the main timeline as an alternating main/broll segment list,
 * dropping any B-roll window that overlaps one already placed (first-come, first-kept) rather
 * than fight over the timeline. Pure and unit-tested — the actual cutting lives in `insertBroll`.
 */
export function buildTimelineSegments(moments: BrollSegment[], durationSec: number): TimelineSegment[] {
  const sorted = [...moments].sort((a, b) => a.start - b.start);

  const segments: TimelineSegment[] = [];
  let cursor = 0;
  for (const m of sorted) {
    if (m.start < cursor) continue;
    if (m.start > cursor) segments.push({ type: 'main', start: cursor, end: m.start });
    segments.push({ type: 'broll', start: m.start, end: m.end, brollPath: m.brollPath });
    cursor = m.end;
  }
  if (durationSec - cursor > 0.05) segments.push({ type: 'main', start: cursor, end: durationSec });

  return segments;
}

/**
 * Cuts away from the main video to a B-roll clip for each given window, while the original audio
 * plays through unbroken underneath (the standard short-form "cutaway" pattern — no audio concat
 * needed at all, since the soundtrack never changes). No-ops (plain copy) if `moments` is empty.
 */
async function insertBroll(input: string, moments: BrollSegment[], outPath: string): Promise<void> {
  if (moments.length === 0) {
    fs.copyFileSync(input, outPath);
    return;
  }

  const { durationSec } = await probe(input);
  const segments = buildTimelineSegments(moments, durationSec);

  const brollFiles = [...new Set(segments.filter((s) => s.type === 'broll').map((s) => s.brollPath!))];
  const inputArgs = ['-i', input, ...brollFiles.flatMap((f) => ['-i', f])];
  const brollInputIndex = new Map(brollFiles.map((f, i) => [f, i + 1]));

  const filterParts: string[] = [];
  const videoLabels: string[] = [];

  segments.forEach((seg, i) => {
    if (seg.type === 'main') {
      filterParts.push(`[0:v]trim=start=${seg.start}:end=${seg.end},setpts=PTS-STARTPTS,setsar=1[v${i}]`);
    } else {
      const idx = brollInputIndex.get(seg.brollPath!);
      const dur = (seg.end - seg.start).toFixed(3);
      filterParts.push(
        `[${idx}:v]trim=start=0:end=${dur},setpts=PTS-STARTPTS,` +
          'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1' +
          `[v${i}]`,
      );
    }
    videoLabels.push(`[v${i}]`);
  });

  const filterComplex =
    filterParts.join(';') + `;${videoLabels.join('')}concat=n=${segments.length}:v=1:a=0[outv]`;

  await runFfmpeg([
    ...inputArgs,
    '-filter_complex', filterComplex,
    '-map', '[outv]',
    '-map', '0:a',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
    '-c:a', 'copy',
    outPath,
  ]);
}

/**
 * Finds B-roll moments for this clip (via Claude) and downloads matching stock footage (via
 * Pexels), returning ready-to-use {start, end, brollPath} segments. Returns an empty array
 * whenever no Pexels key is configured, nothing suitable is suggested, or a search/download
 * fails for a given moment — B-roll is a nice-to-have, never a reason to fail the render.
 */
async function prepareBrollSegments(
  clipWords: Word[],
  clipDurationSec: number,
  workDir: string,
): Promise<BrollSegment[]> {
  if (!env.pexelsApiKey) return [];

  const moments = await suggestBrollMoments(clipWords, clipDurationSec);

  // At most 2 moments per clip, and each is an independent search+download — run them
  // concurrently instead of one after another. Order doesn't matter: insertBroll's caller sorts
  // segments by start time before interleaving them.
  const results = await Promise.all(
    moments.map(async (moment, i): Promise<BrollSegment | null> => {
      try {
        const videoUrl = await searchPexelsVideo(moment.keyword);
        if (!videoUrl) return null;
        const brollPath = path.join(workDir, `broll_${i}.mp4`);
        await downloadBroll(videoUrl, brollPath);
        return { start: moment.start, end: moment.end, brollPath };
      } catch (err) {
        console.log(`[broll] skipping moment "${moment.keyword}": ${err instanceof Error ? err.message : err}`);
        return null;
      }
    }),
  );

  return results.filter((s): s is BrollSegment => s !== null);
}

/**
 * Uses speaker-following crop when the clip has ≥2 distinct speakers, the source has room to pan
 * horizontally, and every speaker's on-screen position was successfully detected. Falls back to
 * the static center crop otherwise, so single-speaker content (the common case) is unaffected and
 * a failed vision call never breaks the render.
 */
async function cropWithSpeakerFramingOrFallback(
  input: string,
  clipWords: Word[],
  workDir: string,
  outPath: string,
): Promise<void> {
  const { width, height } = await probe(input);
  const canPan = width / height > 9 / 16;
  const distinctSpeakers = new Set(clipWords.map((w) => w.speaker).filter((s): s is string => s != null));

  if (canPan && distinctSpeakers.size >= 2) {
    const turns = groupIntoSpeakerTurns(clipWords);
    if (turns.length >= 2) {
      const positions = await detectSpeakerPositions(input, turns, workDir);
      if (turns.every((t) => positions.has(t.speaker))) {
        console.log(`[speakerFraming] following ${turns.length} turns across ${distinctSpeakers.size} speakers`);
        await cropToSpeakerFraming(input, turns, positions, outPath);
        return;
      }
      console.log(`[speakerFraming] falling back to static crop — positioned ${positions.size}/${distinctSpeakers.size} speakers`);
    }
  }

  await cropTo9x16(input, outPath);
}

/**
 * Applies `buildZoomKeyframes`'s alternating zoom schedule by center-cropping a smaller region for
 * "punched-in" segments and scaling every segment back up to the source's own resolution, so
 * output dimensions never change. A no-op copy when there's only one segment (nothing to zoom).
 */
async function applyAutoZoom(input: string, keyframes: ZoomKeyframe[], outPath: string): Promise<void> {
  if (keyframes.length <= 1) {
    fs.copyFileSync(input, outPath);
    return;
  }

  const { width, height } = await probe(input);
  const filterParts: string[] = [];
  const labels: string[] = [];

  keyframes.forEach((kf, i) => {
    const cropWidth = Math.round(width / kf.scale / 2) * 2;
    const cropHeight = Math.round(height / kf.scale / 2) * 2;
    const x = Math.round((width - cropWidth) / 2 / 2) * 2;
    const y = Math.round((height - cropHeight) / 2 / 2) * 2;

    filterParts.push(
      `[0:v]trim=start=${kf.start}:end=${kf.end},setpts=PTS-STARTPTS,` +
        `crop=${cropWidth}:${cropHeight}:${x}:${y},scale=${width}:${height},setsar=1[v${i}]`,
      `[0:a]atrim=start=${kf.start}:end=${kf.end},asetpts=PTS-STARTPTS[a${i}]`,
    );
    labels.push(`[v${i}][a${i}]`);
  });

  const filterComplex =
    filterParts.join(';') + `;${labels.join('')}concat=n=${keyframes.length}:v=1:a=1[outv][outa]`;

  await runFfmpeg([
    '-i', input,
    '-filter_complex', filterComplex,
    '-map', '[outv]', '-map', '[outa]',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
    '-c:a', 'aac',
    outPath,
  ]);
}

/**
 * Mixes a background music track under the clip's existing audio, ducked automatically whenever
 * speech is present (via sidechaincompress, using the speech track itself as the trigger) and
 * faded in/out at the clip's edges. No-ops (plain copy) when `musicPath` is null.
 */
async function addBackgroundMusic(
  input: string,
  musicPath: string | null,
  clipDurationSec: number,
  outPath: string,
): Promise<void> {
  if (!musicPath) {
    fs.copyFileSync(input, outPath);
    return;
  }

  const fadeOutStart = Math.max(0, clipDurationSec - 1).toFixed(3);
  const dur = clipDurationSec.toFixed(3);

  const filterComplex = [
    `[1:a]atrim=start=0:end=${dur},asetpts=PTS-STARTPTS,volume=0.5,` +
      `afade=t=in:d=1,afade=t=out:st=${fadeOutStart}:d=1[music]`,
    '[0:a]asplit=2[speechForDuck][speechOut]',
    '[music][speechForDuck]sidechaincompress=threshold=0.05:ratio=8:attack=5:release=400[duckedMusic]',
    '[speechOut][duckedMusic]amix=inputs=2:duration=first:normalize=0[outa]',
  ].join(';');

  await runFfmpeg([
    '-i', input,
    '-i', musicPath,
    '-filter_complex', filterComplex,
    '-map', '0:v',
    '-map', '[outa]',
    '-c:v', 'copy',
    '-c:a', 'aac',
    outPath,
  ]);
}

/**
 * Picks a mood-matched music track for this clip (via Claude + Jamendo) and downloads it,
 * persisting the choice to `music.json` so a later translation can reuse the exact same track
 * instead of re-classifying/re-searching. Returns null (meaning "no music") whenever no Jamendo
 * key is configured or nothing suitable is found — never a reason to fail the render.
 */
async function prepareMusic(clip: Clip, clipDurationSec: number, workDir: string): Promise<string | null> {
  if (!env.jamendoClientId) return null;

  try {
    const mood = await classifyMood(clip.topic, clip.chosenHook);
    const trackUrl = await searchMoodTrack(mood, clipDurationSec);
    if (!trackUrl) return null;

    const musicPath = path.join(workDir, 'music.mp3');
    await downloadTrack(trackUrl, musicPath);
    fs.writeFileSync(path.join(workDir, 'music.json'), JSON.stringify({ mood, musicPath }), 'utf-8');
    return musicPath;
  } catch (err) {
    console.log(`[music] skipping background music: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

/** Loads a previously-persisted music choice for this clip, if any (used by renderTranslation). */
function loadPersistedMusic(workDir: string): string | null {
  const musicJsonPath = path.join(workDir, 'music.json');
  if (!fs.existsSync(musicJsonPath)) return null;
  try {
    const { musicPath } = JSON.parse(fs.readFileSync(musicJsonPath, 'utf-8')) as { musicPath: string };
    return fs.existsSync(musicPath) ? musicPath : null;
  } catch {
    return null;
  }
}

function wordsInRange(words: Word[], start: number, end: number): Word[] {
  return words
    .filter((w) => w.start >= start && w.end <= end)
    .map((w) => ({ text: w.text, start: w.start - start, end: w.end - start, speaker: w.speaker }));
}

/**
 * Full per-clip render: cut -> remove silence and filler words ("um", "uh", ...) -> crop to 9:16
 * -> auto zoom -> insert B-roll cutaways -> burn captions + hook + CTA -> overlay brand logo ->
 * add sound effect accents -> add mood-matched background music, plus a still cover image per
 * cover-title option. Returns the public URL path (served via express.static) of the finished
 * mp4, and the cover URLs.
 */
export async function renderClip(
  userId: string,
  sourceFile: string,
  clip: Clip,
  allWords: Word[],
): Promise<{ outputFile: string; coverImages: string[] }> {
  const workDir = path.join(env.storageDir, 'clips', clip.id);
  fs.mkdirSync(workDir, { recursive: true });

  const cutPath = path.join(workDir, '1_cut.mp4');
  const silenceRemovedPath = path.join(workDir, '2_nosilence.mp4');
  const croppedPath = path.join(workDir, '3_cropped.mp4');
  const zoomedPath = path.join(workDir, '4_zoomed.mp4');
  const brollPath = path.join(workDir, '5_broll.mp4');
  const captionedPath = path.join(workDir, '6_captioned.mp4');
  const brandedPath = path.join(workDir, '7_branded.mp4');
  const effectsPath = path.join(workDir, '8_effects.mp4');
  const finalPath = path.join(workDir, 'final.mp4');
  const assPath = path.join(workDir, 'captions.ass');

  await cutSegment(sourceFile, clip.startTime, clip.endTime, cutPath);

  const { durationSec: cutDuration } = await probe(cutPath);
  const rawClipWords = wordsInRange(allWords, clip.startTime, clip.endTime);
  const silences = await detectSilences(cutPath);
  const fillerRanges = findFillerWordRanges(rawClipWords);
  const segments = keepSegments([...silences, ...fillerRanges], cutDuration);
  await removeSilence(cutPath, segments, silenceRemovedPath);

  // Filler words are cut out of the audio/video above, and dropped here too so a stray "um"
  // doesn't end up as its own caption cue or waste a B-roll suggestion slot.
  const clipWords = rawClipWords
    .filter((w) => !isFillerWord(w.text))
    .map((w) => ({
      text: w.text,
      start: remapTime(w.start, segments),
      end: remapTime(w.end, segments),
      speaker: w.speaker,
    }));

  await cropWithSpeakerFramingOrFallback(silenceRemovedPath, clipWords, workDir, croppedPath);

  const { durationSec: finalDuration } = await probe(croppedPath);
  const zoomKeyframes = buildZoomKeyframes(finalDuration);
  await applyAutoZoom(croppedPath, zoomKeyframes, zoomedPath);

  const brollSegments = await prepareBrollSegments(clipWords, finalDuration, workDir);
  await insertBroll(zoomedPath, brollSegments, brollPath);

  const captionCues = buildCaptionCues(clipWords);
  const brandForCaptions = await getBrandKit(userId);
  fs.writeFileSync(
    assPath,
    buildAssFile(
      clip.chosenHook,
      captionCues,
      finalDuration,
      clip.cta,
      brandForCaptions.accentColor,
      brandForCaptions.captionStyle,
    ),
    'utf-8',
  );
  // Persisted so a later translation request can re-burn captions in another language onto the
  // same already-cropped video, without re-running transcription/silence-removal/cropping.
  fs.writeFileSync(path.join(workDir, 'captionCues.json'), JSON.stringify(captionCues), 'utf-8');

  await burnSubtitles(brollPath, assPath, captionedPath);
  await applyBrandOverlay(userId, captionedPath, brandedPath);
  const coverImages = await renderCovers(croppedPath, clip.coverOptions ?? [], workDir, clip.id);

  const soundEffectCues = buildSoundEffectCues(captionCues, zoomKeyframes, brandForCaptions.soundEffectsStyle ?? 'professional');
  await applySoundEffects(brandedPath, soundEffectCues, effectsPath);

  const musicPath = await prepareMusic(clip, finalDuration, workDir);
  await addBackgroundMusic(effectsPath, musicPath, finalDuration, finalPath);

  return { outputFile: `/files/${clip.id}/final.mp4`, coverImages };
}

/**
 * Re-burns a clip's captions in another language, reusing the already-cropped-and-broll'd video
 * from the original render — only translation + a caption burn pass are needed, no
 * re-transcription, silence removal, cropping, or B-roll search.
 */
export async function renderTranslation(
  userId: string,
  clip: Clip,
  targetLanguage: string,
): Promise<{ outputFile: string; hook: string }> {
  const workDir = path.join(env.storageDir, 'clips', clip.id);
  // Prefer the post-B-roll video (which also has the auto-zoom already baked in) so translated
  // versions keep the same look; fall back to the plain crop for clips rendered before B-roll
  // and auto-zoom existed.
  const brollPath = path.join(workDir, '5_broll.mp4');
  const croppedPath = fs.existsSync(brollPath) ? brollPath : path.join(workDir, '3_cropped.mp4');
  const cuesPath = path.join(workDir, 'captionCues.json');

  if (!fs.existsSync(croppedPath) || !fs.existsSync(cuesPath)) {
    throw new Error('Original clip render is missing required intermediate files; re-render the clip first.');
  }

  const originalCues: CaptionCue[] = JSON.parse(fs.readFileSync(cuesPath, 'utf-8'));
  const translated = await translateCaptions(
    originalCues.map((c) => c.text),
    clip.chosenHook,
    targetLanguage,
    clip.cta,
  );

  const translatedCues: CaptionCue[] = originalCues.map((cue, i) => ({
    ...cue,
    text: translated.cues[i],
  }));

  const translationDir = path.join(workDir, 'translations', targetLanguage);
  fs.mkdirSync(translationDir, { recursive: true });
  const assPath = path.join(translationDir, 'captions.ass');
  const captionedPath = path.join(translationDir, 'captioned.mp4');
  const brandedPath = path.join(translationDir, 'branded.mp4');
  const outPath = path.join(translationDir, 'final.mp4');

  const { durationSec: finalDuration } = await probe(croppedPath);
  const brandForCaptions = await getBrandKit(userId);
  // translatedCues carries the original clip's per-word `words`/timing (a different language's
  // words, wrong lengths/count) alongside the new translated `text` — a motion caption style would
  // render the ORIGINAL words with the wrong text if used here. Fall back to a static style instead
  // of faking timing for the translation.
  fs.writeFileSync(
    assPath,
    buildAssFile(
      translated.hook,
      translatedCues,
      finalDuration,
      translated.cta,
      brandForCaptions.accentColor,
      staticFallbackFor(brandForCaptions.captionStyle),
    ),
    'utf-8',
  );
  await burnSubtitles(croppedPath, assPath, captionedPath);
  await applyBrandOverlay(userId, captionedPath, brandedPath);

  const musicPath = loadPersistedMusic(workDir);
  await addBackgroundMusic(brandedPath, musicPath, finalDuration, outPath);

  return {
    outputFile: `/files/${clip.id}/translations/${targetLanguage}/final.mp4`,
    hook: translated.hook,
  };
}

/**
 * Re-writes a clip's hook/CTA/cover/social-caption with a tone modifier applied (the spec's
 * "Regenerate: More viral / More professional / ..." feature), reusing the already-cropped,
 * zoomed, and B-roll'd video and its original captions — only the hook/CTA overlay text and cover
 * images change, not the actual spoken-word captions or the underlying edit.
 */
export async function renderRegeneration(
  userId: string,
  clip: Clip,
  modifier: RegenerateModifier,
): Promise<{
  outputFile: string;
  coverImages: string[];
  hookOptions: string[];
  chosenHook: string;
  cta: string;
  socialCaption: SocialCaption;
}> {
  const workDir = path.join(env.storageDir, 'clips', clip.id);
  // Same post-B-roll-or-plain-crop fallback as renderTranslation — see its comment.
  const brollPath = path.join(workDir, '5_broll.mp4');
  const croppedPath = fs.existsSync(brollPath) ? brollPath : path.join(workDir, '3_cropped.mp4');
  const cuesPath = path.join(workDir, 'captionCues.json');

  if (!fs.existsSync(croppedPath) || !fs.existsSync(cuesPath)) {
    throw new Error('Original clip render is missing required intermediate files; re-render the clip first.');
  }

  const originalCues: CaptionCue[] = JSON.parse(fs.readFileSync(cuesPath, 'utf-8'));
  const spokenText = originalCues.map((c) => c.text).join(' ');
  const persona = await getActivePersona(userId);
  const regenerated = await regenerateCreative(clip.topic, spokenText, clip.chosenHook, clip.cta, modifier, persona);
  const chosenHook = regenerated.hookOptions[0] ?? clip.chosenHook;

  const regenDir = path.join(workDir, 'regenerations', modifier);
  fs.mkdirSync(regenDir, { recursive: true });
  const assPath = path.join(regenDir, 'captions.ass');
  const captionedPath = path.join(regenDir, 'captioned.mp4');
  const brandedPath = path.join(regenDir, 'branded.mp4');
  const outPath = path.join(regenDir, 'final.mp4');

  const { durationSec: finalDuration } = await probe(croppedPath);
  const brandForCaptions = await getBrandKit(userId);
  fs.writeFileSync(
    assPath,
    buildAssFile(
      chosenHook,
      originalCues,
      finalDuration,
      regenerated.cta,
      brandForCaptions.accentColor,
      brandForCaptions.captionStyle,
    ),
    'utf-8',
  );
  await burnSubtitles(croppedPath, assPath, captionedPath);
  await applyBrandOverlay(userId, captionedPath, brandedPath);

  const musicPath = loadPersistedMusic(workDir);
  await addBackgroundMusic(brandedPath, musicPath, finalDuration, outPath);

  const coverImages = await renderCovers(
    croppedPath,
    regenerated.coverOptions,
    regenDir,
    `${clip.id}/regenerations/${modifier}`,
  );

  return {
    outputFile: `/files/${clip.id}/regenerations/${modifier}/final.mp4`,
    coverImages,
    hookOptions: regenerated.hookOptions,
    chosenHook,
    cta: regenerated.cta,
    socialCaption: regenerated.socialCaption,
  };
}

/**
 * Reads back the real word-level transcript timing for a clip's primary render (persisted by
 * renderClip as captionCues.json), flattened out of its cue grouping — used by the
 * GET .../caption-words route so the mobile editor can show real words to tap, not a stub.
 */
export function loadCaptionWords(clip: Clip): Word[] {
  const cuesPath = path.join(env.storageDir, 'clips', clip.id, 'captionCues.json');
  if (!fs.existsSync(cuesPath)) {
    throw new Error('No caption data for this clip yet; render it first.');
  }
  const cues: CaptionCue[] = JSON.parse(fs.readFileSync(cuesPath, 'utf-8'));
  return cues.flatMap((c) => c.words);
}

/**
 * Re-burns a clip's PRIMARY captions with manual per-word formatting overrides (EditCaptionsScreen
 * — color/bold/italic/highlight/scale) layered on top of whatever automatic style is active,
 * reusing the already-cropped-and-broll'd video exactly like renderTranslation/renderRegeneration
 * do. Unlike those two, this overwrites the clip's own primary output in place (same
 * captions.ass/6_captioned.mp4/7_branded.mp4/final.mp4 paths renderClip already produced) rather
 * than writing a new variant subfolder — a caption-formatting edit isn't an alternate version to
 * pick between, it's "fix how my one clip's captions look." Skips sound-effect re-application,
 * matching the same accepted limitation renderTranslation/renderRegeneration already have (sound
 * cues are timing-only and unaffected by caption color/bold/etc).
 */
export async function renderCaptionEdits(
  userId: string,
  clip: Clip,
  overrides: WordFormatOverride[],
): Promise<{ outputFile: string }> {
  const workDir = path.join(env.storageDir, 'clips', clip.id);
  // Same post-B-roll-or-plain-crop fallback as renderTranslation/renderRegeneration.
  const brollPath = path.join(workDir, '5_broll.mp4');
  const croppedPath = fs.existsSync(brollPath) ? brollPath : path.join(workDir, '3_cropped.mp4');
  const cuesPath = path.join(workDir, 'captionCues.json');

  if (!fs.existsSync(croppedPath) || !fs.existsSync(cuesPath)) {
    throw new Error('Original clip render is missing required intermediate files; re-render the clip first.');
  }

  const originalCues: CaptionCue[] = JSON.parse(fs.readFileSync(cuesPath, 'utf-8'));

  const assPath = path.join(workDir, 'captions.ass');
  const captionedPath = path.join(workDir, '6_captioned.mp4');
  const brandedPath = path.join(workDir, '7_branded.mp4');
  const finalPath = path.join(workDir, 'final.mp4');

  const { durationSec: finalDuration } = await probe(croppedPath);
  const brandForCaptions = await getBrandKit(userId);
  fs.writeFileSync(
    assPath,
    buildAssFile(
      clip.chosenHook,
      originalCues,
      finalDuration,
      clip.cta,
      brandForCaptions.accentColor,
      brandForCaptions.captionStyle,
      overrides,
    ),
    'utf-8',
  );
  await burnSubtitles(croppedPath, assPath, captionedPath);
  await applyBrandOverlay(userId, captionedPath, brandedPath);

  const musicPath = loadPersistedMusic(workDir);
  await addBackgroundMusic(brandedPath, musicPath, finalDuration, finalPath);

  return { outputFile: `/files/${clip.id}/final.mp4` };
}
