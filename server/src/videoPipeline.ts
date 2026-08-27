import fs from 'node:fs';
import path from 'node:path';
import { v4 as uuid } from 'uuid';
import { runFfmpeg, probe, escapeFfmpegFilterPath } from './ffmpegRunner.js';
import { buildAssFile, buildCaptionCues, type CaptionCue } from './ass.js';
import { translateCaptions } from './translate.js';
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

function wordsInRange(words: Word[], start: number, end: number): Word[] {
  return words
    .filter((w) => w.start >= start && w.end <= end)
    .map((w) => ({ text: w.text, start: w.start - start, end: w.end - start }));
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
  const finalPath = path.join(workDir, 'final.mp4');
  const assPath = path.join(workDir, 'captions.ass');

  await cutSegment(sourceFile, clip.startTime, clip.endTime, cutPath);

  const { durationSec: cutDuration } = await probe(cutPath);
  const silences = await detectSilences(cutPath);
  const segments = keepSegments(silences, cutDuration);
  await removeSilence(cutPath, segments, silenceRemovedPath);

  await cropTo9x16(silenceRemovedPath, croppedPath);

  const clipWords = wordsInRange(allWords, clip.startTime, clip.endTime).map((w) => ({
    text: w.text,
    start: remapTime(w.start, segments),
    end: remapTime(w.end, segments),
  }));
  const captionCues = buildCaptionCues(clipWords);
  fs.writeFileSync(assPath, buildAssFile(clip.chosenHook, captionCues), 'utf-8');
  // Persisted so a later translation request can re-burn captions in another language onto the
  // same already-cropped video, without re-running transcription/silence-removal/cropping.
  fs.writeFileSync(path.join(workDir, 'captionCues.json'), JSON.stringify(captionCues), 'utf-8');

  await burnSubtitles(croppedPath, assPath, finalPath);

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
  const outPath = path.join(translationDir, 'final.mp4');

  fs.writeFileSync(assPath, buildAssFile(translated.hook, translatedCues), 'utf-8');
  await burnSubtitles(croppedPath, assPath, outPath);

  return {
    outputFile: `/files/${clip.id}/translations/${targetLanguage}/final.mp4`,
    hook: translated.hook,
  };
}
