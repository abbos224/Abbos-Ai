import fs from 'node:fs';
import path from 'node:path';
import { v4 as uuid } from 'uuid';
import { runFfmpeg, probe, escapeFfmpegFilterPath } from './ffmpegRunner.js';
import { buildAssFile, buildCaptionCues, type CaptionCue } from './ass.js';
import { translateCaptions } from './translate.js';
import { groupIntoSpeakerTurns, detectSpeakerPositions, type SpeakerTurn } from './speakerFraming.js';
import { classifyMood, searchMoodTrack, downloadTrack } from './music.js';
import type { Word } from './transcription.js';
import type { Clip } from './store.js';
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
    '-vf', `${cropFilter},scale=1080:1920`,
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
      `[0:v]trim=start=${start}:end=${end},setpts=PTS-STARTPTS,crop=${cropWidth}:${height}:${x}:0,scale=1080:1920[v${i}]`,
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
 * Full per-clip render: cut -> remove silence -> crop to 9:16 -> burn captions + hook.
 * Returns the public URL path (served via express.static) of the finished mp4.
 */
export async function renderClip(sourceFile: string, clip: Clip, allWords: Word[]): Promise<string> {
  const workDir = path.join(env.storageDir, 'clips', clip.id);
  fs.mkdirSync(workDir, { recursive: true });

  const cutPath = path.join(workDir, '1_cut.mp4');
  const silenceRemovedPath = path.join(workDir, '2_nosilence.mp4');
  const croppedPath = path.join(workDir, '3_cropped.mp4');
  const captionedPath = path.join(workDir, '4_captioned.mp4');
  const finalPath = path.join(workDir, 'final.mp4');
  const assPath = path.join(workDir, 'captions.ass');

  await cutSegment(sourceFile, clip.startTime, clip.endTime, cutPath);

  const { durationSec: cutDuration } = await probe(cutPath);
  const silences = await detectSilences(cutPath);
  const segments = keepSegments(silences, cutDuration);
  await removeSilence(cutPath, segments, silenceRemovedPath);

  const clipWords = wordsInRange(allWords, clip.startTime, clip.endTime).map((w) => ({
    text: w.text,
    start: remapTime(w.start, segments),
    end: remapTime(w.end, segments),
    speaker: w.speaker,
  }));

  await cropWithSpeakerFramingOrFallback(silenceRemovedPath, clipWords, workDir, croppedPath);

  const { durationSec: finalDuration } = await probe(croppedPath);
  const captionCues = buildCaptionCues(clipWords);
  fs.writeFileSync(assPath, buildAssFile(clip.chosenHook, captionCues), 'utf-8');
  // Persisted so a later translation request can re-burn captions in another language onto the
  // same already-cropped video, without re-running transcription/silence-removal/cropping.
  fs.writeFileSync(path.join(workDir, 'captionCues.json'), JSON.stringify(captionCues), 'utf-8');

  await burnSubtitles(croppedPath, assPath, captionedPath);

  const musicPath = await prepareMusic(clip, finalDuration, workDir);
  await addBackgroundMusic(captionedPath, musicPath, finalDuration, finalPath);

  return `/files/${clip.id}/final.mp4`;
}

/**
 * Re-burns a clip's captions in another language, reusing the already-cropped video from the
 * original render (`3_cropped.mp4`) — only translation + a caption burn pass are needed, no
 * re-transcription, silence removal, or cropping.
 */
export async function renderTranslation(
  clip: Clip,
  targetLanguage: string,
): Promise<{ outputFile: string; hook: string }> {
  const workDir = path.join(env.storageDir, 'clips', clip.id);
  const croppedPath = path.join(workDir, '3_cropped.mp4');
  const cuesPath = path.join(workDir, 'captionCues.json');

  if (!fs.existsSync(croppedPath) || !fs.existsSync(cuesPath)) {
    throw new Error('Original clip render is missing required intermediate files; re-render the clip first.');
  }

  const originalCues: CaptionCue[] = JSON.parse(fs.readFileSync(cuesPath, 'utf-8'));
  const translated = await translateCaptions(
    originalCues.map((c) => c.text),
    clip.chosenHook,
    targetLanguage,
  );

  const translatedCues: CaptionCue[] = originalCues.map((cue, i) => ({
    ...cue,
    text: translated.cues[i],
  }));

  const translationDir = path.join(workDir, 'translations', targetLanguage);
  fs.mkdirSync(translationDir, { recursive: true });
  const assPath = path.join(translationDir, 'captions.ass');
  const captionedPath = path.join(translationDir, 'captioned.mp4');
  const outPath = path.join(translationDir, 'final.mp4');

  fs.writeFileSync(assPath, buildAssFile(translated.hook, translatedCues), 'utf-8');
  await burnSubtitles(croppedPath, assPath, captionedPath);

  const { durationSec: finalDuration } = await probe(croppedPath);
  const musicPath = loadPersistedMusic(workDir);
  await addBackgroundMusic(captionedPath, musicPath, finalDuration, outPath);

  return {
    outputFile: `/files/${clip.id}/translations/${targetLanguage}/final.mp4`,
    hook: translated.hook,
  };
}
