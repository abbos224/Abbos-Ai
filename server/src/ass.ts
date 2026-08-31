import type { Word } from './transcription.js';

export type CaptionCue = { start: number; end: number; text: string };

/** Groups clip-relative words into short caption cues (~4 words / ~2.2s max per cue). Preserves
 * natural case — casing is a style-preset decision, applied later in buildAssFile. */
export function buildCaptionCues(words: Word[]): CaptionCue[] {
  const cues: CaptionCue[] = [];
  let buffer: Word[] = [];

  const flush = () => {
    if (buffer.length === 0) return;
    cues.push({
      start: buffer[0].start,
      end: buffer[buffer.length - 1].end,
      text: buffer.map((w) => w.text).join(' '),
    });
    buffer = [];
  };

  for (const word of words) {
    buffer.push(word);
    const duration = buffer[buffer.length - 1].end - buffer[0].start;
    const endsSentence = /[.!?,]$/.test(word.text);
    if (buffer.length >= 4 || duration >= 2.2 || endsSentence) flush();
  }
  flush();

  return cues;
}

function formatAssTime(seconds: number): string {
  const clamped = Math.max(0, seconds);
  const h = Math.floor(clamped / 3600);
  const m = Math.floor((clamped % 3600) / 60);
  const s = Math.floor(clamped % 60);
  const cs = Math.round((clamped - Math.floor(clamped)) * 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

function escapeAssText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\{/g, '\\{').replace(/\}/g, '\\}').replace(/\n/g, '\\N');
}

/** Converts a "#RRGGBB" web hex color into ASS's &HAABBGGRR format (opaque, alpha 00). */
function hexToAssColor(hex: string): string {
  const clean = hex.replace('#', '');
  const r = clean.slice(0, 2);
  const g = clean.slice(2, 4);
  const b = clean.slice(4, 6);
  return `&H00${b}${g}${r}`.toUpperCase();
}

export type CaptionStyleName = 'bold' | 'minimal' | 'podcast' | 'kinetic' | 'luxury' | 'gaming';

type StylePreset = {
  fontHook: string;
  fontCaption: string;
  sizeHook: number;
  sizeCaption: number;
  bold: 0 | -1;
  italic: 0 | -1;
  spacing: number;
  borderStyle: 1 | 3;
  outline: number;
  shadow: number;
  upperCase: boolean;
  animate: boolean;
  /** Whether the brand accent (or this preset's own default) colors the text fill or the outline. */
  colorRole: 'outline' | 'fill';
  defaultAccent: string;
  backColor: string;
};

const PRESETS: Record<CaptionStyleName, StylePreset> = {
  bold: {
    fontHook: 'Arial Black', fontCaption: 'Arial Black', sizeHook: 78, sizeCaption: 66,
    bold: -1, italic: 0, spacing: 0, borderStyle: 1, outline: 5, shadow: 0,
    upperCase: true, animate: false, colorRole: 'outline', defaultAccent: '#000000',
    backColor: '&H80000000',
  },
  minimal: {
    fontHook: 'Arial', fontCaption: 'Arial', sizeHook: 56, sizeCaption: 46,
    bold: 0, italic: 0, spacing: 0, borderStyle: 1, outline: 1.5, shadow: 0,
    upperCase: false, animate: false, colorRole: 'outline', defaultAccent: '#000000',
    backColor: '&H80000000',
  },
  podcast: {
    fontHook: 'Georgia', fontCaption: 'Georgia', sizeHook: 58, sizeCaption: 48,
    bold: 0, italic: -1, spacing: 0, borderStyle: 3, outline: 2, shadow: 0,
    upperCase: false, animate: false, colorRole: 'fill', defaultAccent: '#F2C94C',
    backColor: '&HA0000000',
  },
  kinetic: {
    fontHook: 'Arial Black', fontCaption: 'Arial Black', sizeHook: 78, sizeCaption: 66,
    bold: -1, italic: 0, spacing: 0, borderStyle: 1, outline: 5, shadow: 0,
    upperCase: true, animate: true, colorRole: 'outline', defaultAccent: '#000000',
    backColor: '&H80000000',
  },
  luxury: {
    fontHook: 'Georgia', fontCaption: 'Georgia', sizeHook: 52, sizeCaption: 44,
    bold: 0, italic: 0, spacing: 2, borderStyle: 1, outline: 1, shadow: 0,
    upperCase: false, animate: false, colorRole: 'fill', defaultAccent: '#D4AF37',
    backColor: '&H80000000',
  },
  gaming: {
    fontHook: 'Arial Black', fontCaption: 'Arial Black', sizeHook: 80, sizeCaption: 68,
    bold: -1, italic: 0, spacing: 0, borderStyle: 1, outline: 6, shadow: 0,
    upperCase: true, animate: false, colorRole: 'fill', defaultAccent: '#39FF88',
    backColor: '&H80000000',
  },
};

export const CAPTION_STYLES: CaptionStyleName[] = Object.keys(PRESETS) as CaptionStyleName[];

const HOOK_DURATION = 2.5;
const CTA_DURATION = 2.5;
/** Pop-in scale animation applied to each cue's start, for the "kinetic" preset. */
const KINETIC_PREFIX = '{\\t(0,120,\\fscx112\\fscy112)\\t(120,220,\\fscx100\\fscy100)}';

/** Builds a full .ass subtitle file: a "Hook" headline for the first ~3s, word-group captions in
 * between, and an optional CTA line burned into the last ~2.5s of the clip. */
export function buildAssFile(
  hookText: string,
  captionCues: CaptionCue[],
  clipDurationSec: number,
  ctaText?: string,
  accentColorHex?: string,
  styleName: CaptionStyleName = 'bold',
): string {
  const preset = PRESETS[styleName];
  const accent = accentColorHex ?? preset.defaultAccent;
  const accentAss = hexToAssColor(accent);
  const primaryColor = preset.colorRole === 'fill' ? accentAss : '&H00FFFFFF';
  const outlineColor = preset.colorRole === 'outline' ? accentAss : '&H00000000';

  // The hook headline always gets its own fixed window up front, and the CTA (if any) gets one at
  // the end. Real captions are pushed out of the hook window and clipped before the CTA window —
  // never dropped, just kept from fighting either for screen time.
  const ctaStart = ctaText ? Math.max(HOOK_DURATION, clipDurationSec - CTA_DURATION) : clipDurationSec;
  const cues = captionCues
    .map((cue) => ({ ...cue, start: Math.max(cue.start, HOOK_DURATION), end: Math.min(cue.end, ctaStart) }))
    .filter((cue) => cue.end - cue.start > 0.05);

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Hook,${preset.fontHook},${preset.sizeHook},${primaryColor},${primaryColor},${outlineColor},${preset.backColor},${preset.bold},${preset.italic},0,0,100,100,${preset.spacing},0,${preset.borderStyle},${preset.outline},${preset.shadow},8,60,60,140,1
Style: Caption,${preset.fontCaption},${preset.sizeCaption},${primaryColor},${primaryColor},${outlineColor},${preset.backColor},${preset.bold},${preset.italic},0,0,100,100,${preset.spacing},0,${preset.borderStyle},${preset.outline},${preset.shadow},2,60,60,180,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const applyCase = (text: string) => (preset.upperCase ? text.toUpperCase() : text);
  const animPrefix = preset.animate ? KINETIC_PREFIX : '';

  const lines: string[] = [];
  lines.push(
    `Dialogue: 0,${formatAssTime(0)},${formatAssTime(HOOK_DURATION)},Hook,,0,0,0,,${animPrefix}${escapeAssText(applyCase(hookText))}`,
  );
  for (const cue of cues) {
    lines.push(
      `Dialogue: 0,${formatAssTime(cue.start)},${formatAssTime(cue.end)},Caption,,0,0,0,,${animPrefix}${escapeAssText(applyCase(cue.text))}`,
    );
  }
  if (ctaText) {
    lines.push(
      `Dialogue: 0,${formatAssTime(ctaStart)},${formatAssTime(clipDurationSec)},Caption,,0,0,0,,${animPrefix}${escapeAssText(applyCase(ctaText))}`,
    );
  }

  return header + lines.join('\n') + '\n';
}
