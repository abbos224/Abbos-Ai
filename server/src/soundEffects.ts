import fs from 'node:fs';
import path from 'node:path';
import { runFfmpeg } from './ffmpegRunner.js';
import { env } from './env.js';

export type SoundEffectsStyle = 'professional' | 'minimal' | 'dynamic';

export const SOUND_EFFECTS_STYLES: SoundEffectsStyle[] = ['professional', 'minimal', 'dynamic'];

export function isSoundEffectsStyle(value: string): value is SoundEffectsStyle {
  return (SOUND_EFFECTS_STYLES as string[]).includes(value);
}

export type SoundEffect = 'whoosh' | 'ding' | 'alert';
export type SoundEffectCue = { time: number; effect: SoundEffect };

const NUMBER_PATTERN = /\$[\d,]+(\.\d+)?|\d{1,3}(,\d{3})+|\d+%/;
const WARNING_WORDS = ['warning', "don't", 'dont', 'mistake', 'never', 'stop', 'danger', 'careful', 'wrong'];

type CaptionLike = { start: number; text: string };
type ZoomKeyframeLike = { start: number; scale: number };

/**
 * Decides which accent sounds to place where, given the clip's caption cues and zoom schedule.
 * Pure and unit-tested — the actual audio synthesis/mixing lives in `applySoundEffects`.
 *
 * - "professional": no effects at all — the safe default for business content.
 * - "minimal": a whoosh at each zoom punch-in/out, matching the motion that's already there.
 * - "dynamic": minimal's whooshes, plus a ding when a cue mentions a number/price/percentage and
 *   an alert when a cue uses a warning/caution word (never both for the same cue — alert wins).
 */
export function buildSoundEffectCues(
  captionCues: CaptionLike[],
  zoomKeyframes: ZoomKeyframeLike[],
  style: SoundEffectsStyle,
): SoundEffectCue[] {
  if (style === 'professional') return [];

  const cues: SoundEffectCue[] = [];

  for (let i = 1; i < zoomKeyframes.length; i++) {
    if (zoomKeyframes[i].scale !== zoomKeyframes[i - 1].scale) {
      cues.push({ time: zoomKeyframes[i].start, effect: 'whoosh' });
    }
  }

  if (style === 'dynamic') {
    for (const cue of captionCues) {
      const lower = cue.text.toLowerCase();
      if (WARNING_WORDS.some((w) => lower.includes(w))) {
        cues.push({ time: cue.start, effect: 'alert' });
      } else if (NUMBER_PATTERN.test(cue.text)) {
        cues.push({ time: cue.start, effect: 'ding' });
      }
    }
  }

  return cues.sort((a, b) => a.time - b.time);
}

// Each effect is synthesized on the fly via ffmpeg's aevalsrc expression source — a plain math
// formula rendered to audio — so there's no external sound-asset library or API to depend on.
const EFFECT_SYNTH: Record<SoundEffect, { expr: string; duration: number }> = {
  whoosh: { expr: '0.35*sin(2*PI*(600+3200*t/0.25)*t)*exp(-3*t)', duration: 0.25 },
  ding: { expr: '0.4*sin(2*PI*1300*t)*exp(-9*t)', duration: 0.3 },
  alert: { expr: '0.4*sin(2*PI*880*t)*(0.5+0.5*sin(2*PI*7*t))', duration: 0.4 },
};

const effectsDir = path.join(env.storageDir, 'soundEffects');

/** Synthesizes (once, cached on disk thereafter) a short effect clip for reuse across renders. */
async function getEffectFile(effect: SoundEffect): Promise<string> {
  const filePath = path.join(effectsDir, `${effect}.wav`);
  if (fs.existsSync(filePath)) return filePath;

  fs.mkdirSync(effectsDir, { recursive: true });
  const { expr, duration } = EFFECT_SYNTH[effect];
  await runFfmpeg(['-f', 'lavfi', '-i', `aevalsrc='${expr}':s=44100:d=${duration}`, filePath]);
  return filePath;
}

/**
 * Mixes short synthesized accent sounds into the clip's audio at each cue's timestamp, ducking
 * nothing (they're brief and quiet enough to sit under the speech). A no-op copy when there are
 * no cues — the common case for "professional" style or a clip with no number/warning cues.
 */
export async function applySoundEffects(input: string, cues: SoundEffectCue[], outPath: string): Promise<void> {
  if (cues.length === 0) {
    fs.copyFileSync(input, outPath);
    return;
  }

  const effectFiles = await Promise.all(cues.map((c) => getEffectFile(c.effect)));

  const inputArgs = ['-i', input, ...effectFiles.flatMap((f) => ['-i', f])];
  const fxLabels = cues.map((cue, i) => {
    const delayMs = Math.max(0, Math.round(cue.time * 1000));
    return `[${i + 1}:a]adelay=${delayMs},aformat=sample_rates=44100:channel_layouts=stereo[fx${i}]`;
  });
  const mixInputs = ['[main]', ...cues.map((_, i) => `[fx${i}]`)].join('');
  const filterComplex =
    `[0:a]aformat=sample_rates=44100:channel_layouts=stereo[main];` +
    fxLabels.join(';') +
    `;${mixInputs}amix=inputs=${cues.length + 1}:duration=first:normalize=0[outa]`;

  await runFfmpeg([
    ...inputArgs,
    '-filter_complex', filterComplex,
    '-map', '0:v',
    '-map', '[outa]',
    '-c:v', 'copy',
    '-c:a', 'aac',
    outPath,
  ]);
}
