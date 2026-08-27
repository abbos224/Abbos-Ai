import type { Word } from './transcription.js';

export type CaptionCue = { start: number; end: number; text: string };

/** Groups clip-relative words into short caption cues (~4 words / ~2.2s max per cue). */
export function buildCaptionCues(words: Word[]): CaptionCue[] {
  const cues: CaptionCue[] = [];
  let buffer: Word[] = [];

  const flush = () => {
    if (buffer.length === 0) return;
    cues.push({
      start: buffer[0].start,
      end: buffer[buffer.length - 1].end,
      text: buffer.map((w) => w.text.toUpperCase()).join(' '),
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

/** Builds a full .ass subtitle file: a "Hook" headline for the first ~3s, plus bold word-group captions. */
const HOOK_DURATION = 2.5;

export function buildAssFile(hookText: string, captionCues: CaptionCue[], accentColorHex?: string): string {
  const outlineColor = accentColorHex ? hexToAssColor(accentColorHex) : '&H00000000';
  // The hook headline always gets its own fixed window up front. Real captions are pushed
  // out of that window (clipped, not dropped) so they never fight the hook for screen time.
  const cues = captionCues
    .map((cue) => ({ ...cue, start: Math.max(cue.start, HOOK_DURATION) }))
    .filter((cue) => cue.end - cue.start > 0.05);

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Hook,Arial Black,78,&H00FFFFFF,&H00FFFFFF,${outlineColor},&H80000000,-1,0,0,0,100,100,0,0,1,5,0,8,60,60,140,1
Style: Caption,Arial Black,66,&H00FFFFFF,&H00FFFFFF,${outlineColor},&H80000000,-1,0,0,0,100,100,0,0,1,5,0,2,60,60,180,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const lines: string[] = [];
  lines.push(
    `Dialogue: 0,${formatAssTime(0)},${formatAssTime(HOOK_DURATION)},Hook,,0,0,0,,${escapeAssText(hookText.toUpperCase())}`,
  );
  for (const cue of cues) {
    lines.push(
      `Dialogue: 0,${formatAssTime(cue.start)},${formatAssTime(cue.end)},Caption,,0,0,0,,${escapeAssText(cue.text)}`,
    );
  }

  return header + lines.join('\n') + '\n';
}
