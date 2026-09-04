import type { Word } from './transcription.js';

export type CaptionCue = { start: number; end: number; text: string; words: Word[] };

/** Groups clip-relative words into short caption cues (~4 words / ~2.2s max per cue). Preserves
 * natural case — casing is a style-preset decision, applied later in buildAssFile. Keeps each
 * word's own start/end (not just the joined text) so motion caption styles can highlight/pop
 * individual words in real time instead of only ever revealing a whole cue at once. */
export function buildCaptionCues(words: Word[]): CaptionCue[] {
  const cues: CaptionCue[] = [];
  let buffer: Word[] = [];

  const flush = () => {
    if (buffer.length === 0) return;
    cues.push({
      start: buffer[0].start,
      end: buffer[buffer.length - 1].end,
      text: buffer.map((w) => w.text).join(' '),
      words: buffer,
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

/** Real "Captions"/CapCut-style motion captions show only 1-2 words on screen at once — a much
 * tighter burst than the ~4-word phrase blocks the static styles use — so the highlight/pop reads
 * as punchy rather than a slow sweep across a long line. Regroups the flattened word stream from
 * buildCaptionCues at these tighter bounds; used only for karaoke/wordPop styles. */
function regroupForMotion(words: Word[]): { start: number; end: number; words: Word[] }[] {
  const groups: { start: number; end: number; words: Word[] }[] = [];
  let buffer: Word[] = [];

  const flush = () => {
    if (buffer.length === 0) return;
    groups.push({ start: buffer[0].start, end: buffer[buffer.length - 1].end, words: buffer });
    buffer = [];
  };

  for (const word of words) {
    buffer.push(word);
    const duration = buffer[buffer.length - 1].end - buffer[0].start;
    const endsSentence = /[.!?,]$/.test(word.text);
    if (buffer.length >= 2 || duration >= 1.1 || endsSentence) flush();
  }
  flush();

  return groups;
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

/** Converts a "#RRGGBB" web hex color into ASS's &HAABBGGRR format (opaque, alpha 00) — used in
 * the [V4+ Styles] table. */
function hexToAssColor(hex: string): string {
  const clean = hex.replace('#', '');
  const r = clean.slice(0, 2);
  const g = clean.slice(2, 4);
  const b = clean.slice(4, 6);
  return `&H00${b}${g}${r}`.toUpperCase();
}

/** Converts a "#RRGGBB" web hex color into an inline \c override value (&HBBGGRR&, no alpha
 * byte, trailing &) — a different format from the Style-table one above, used by "emphasisWord"
 * to recolor a single word mid-line and then reset back to the line's default color. */
function hexToInlineAssColor(hex: string): string {
  const clean = hex.replace('#', '');
  const r = clean.slice(0, 2);
  const g = clean.slice(2, 4);
  const b = clean.slice(4, 6);
  return `&H${b}${g}${r}&`.toUpperCase();
}

export type CaptionStyleName =
  | 'bold' | 'minimal' | 'podcast' | 'kinetic' | 'luxury' | 'gaming'
  | 'karaoke' | 'wordPop' | 'highlightBox' | 'emphasisWord';

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
  /** Word-level motion for the spoken-caption cues (not the Hook/CTA headline lines): 'none' is
   * every static style's whole-line behavior; 'karaoke' sweeps the accent color across each word
   * in real time (plus a per-word scale-pop) via ASS's native \k tag; 'wordPop'/'highlightBox'
   * pop each word in individually, one Dialogue line per word, right as it's spoken — the same
   * timing/animation, 'highlightBox' just adds a solid color box behind it (BorderStyle 3).
   * 'emphasisWord' keeps the normal ~4-word static phrase grouping but recolors the single
   * longest word in each phrase, mirroring the "one word in a different color" look real caption
   * apps use for emphasis — no per-word timing needed for that one. karaoke/wordPop/highlightBox
   * use regroupForMotion's tighter 1-2-word bursts instead of the ~4-word static grouping. */
  motion: 'none' | 'karaoke' | 'wordPop' | 'emphasisWord';
  /** Whether the brand accent (or this preset's own default) colors the text fill or the outline. */
  colorRole: 'outline' | 'fill';
  defaultAccent: string;
  backColor: string;
};

const PRESETS: Record<CaptionStyleName, StylePreset> = {
  bold: {
    fontHook: 'Arial Black', fontCaption: 'Arial Black', sizeHook: 78, sizeCaption: 66,
    bold: -1, italic: 0, spacing: 0, borderStyle: 1, outline: 5, shadow: 0,
    upperCase: true, animate: false, motion: 'none', colorRole: 'outline', defaultAccent: '#000000',
    backColor: '&H80000000',
  },
  minimal: {
    fontHook: 'Arial', fontCaption: 'Arial', sizeHook: 56, sizeCaption: 46,
    bold: 0, italic: 0, spacing: 0, borderStyle: 1, outline: 1.5, shadow: 0,
    upperCase: false, animate: false, motion: 'none', colorRole: 'outline', defaultAccent: '#000000',
    backColor: '&H80000000',
  },
  podcast: {
    fontHook: 'Georgia', fontCaption: 'Georgia', sizeHook: 58, sizeCaption: 48,
    bold: 0, italic: -1, spacing: 0, borderStyle: 3, outline: 2, shadow: 0,
    upperCase: false, animate: false, motion: 'none', colorRole: 'fill', defaultAccent: '#F2C94C',
    backColor: '&HA0000000',
  },
  kinetic: {
    fontHook: 'Arial Black', fontCaption: 'Arial Black', sizeHook: 78, sizeCaption: 66,
    bold: -1, italic: 0, spacing: 0, borderStyle: 1, outline: 5, shadow: 0,
    upperCase: true, animate: true, motion: 'none', colorRole: 'outline', defaultAccent: '#000000',
    backColor: '&H80000000',
  },
  luxury: {
    fontHook: 'Georgia', fontCaption: 'Georgia', sizeHook: 52, sizeCaption: 44,
    bold: 0, italic: 0, spacing: 2, borderStyle: 1, outline: 1, shadow: 0,
    upperCase: false, animate: false, motion: 'none', colorRole: 'fill', defaultAccent: '#D4AF37',
    backColor: '&H80000000',
  },
  gaming: {
    fontHook: 'Arial Black', fontCaption: 'Arial Black', sizeHook: 80, sizeCaption: 68,
    bold: -1, italic: 0, spacing: 0, borderStyle: 1, outline: 6, shadow: 0,
    upperCase: true, animate: false, motion: 'none', colorRole: 'fill', defaultAccent: '#39FF88',
    backColor: '&H80000000',
  },
  // Below: the two motion caption styles. Hook/CTA headline text is unaffected (that text is the
  // AI's chosen hook/CTA, not word-timed transcript data) — only the spoken-caption cues animate.
  // Bigger font than the static styles: showing only 1-2 words at a time (see regroupForMotion)
  // means there's room to fill the frame the way real caption apps do.
  karaoke: {
    fontHook: 'Arial Black', fontCaption: 'Arial Black', sizeHook: 84, sizeCaption: 100,
    bold: -1, italic: 0, spacing: 0, borderStyle: 1, outline: 7, shadow: 0,
    upperCase: true, animate: false, motion: 'karaoke', colorRole: 'fill', defaultAccent: '#22D3EE',
    backColor: '&H80000000',
  },
  wordPop: {
    fontHook: 'Arial Black', fontCaption: 'Arial Black', sizeHook: 84, sizeCaption: 100,
    bold: -1, italic: 0, spacing: 0, borderStyle: 1, outline: 7, shadow: 0,
    upperCase: true, animate: false, motion: 'wordPop', colorRole: 'fill', defaultAccent: '#FFD60A',
    backColor: '&H80000000',
  },
  // BorderStyle 3 ("opaque box") turns the Outline colour into a solid rectangle fill behind the
  // text instead of a stroke — the "Outline" width becomes the box's padding. Reuses wordPop's
  // exact per-word pop-in timing, just with a solid color box instead of an outline.
  highlightBox: {
    fontHook: 'Arial Black', fontCaption: 'Arial Black', sizeHook: 84, sizeCaption: 88,
    bold: -1, italic: 0, spacing: 0, borderStyle: 3, outline: 24, shadow: 0,
    upperCase: true, animate: false, motion: 'wordPop', colorRole: 'outline', defaultAccent: '#7C3AED',
    backColor: '&H80000000',
  },
  // Keeps the normal, static ~4-word phrase (no per-word timing) but recolors the single longest
  // word in each phrase to the accent color — the "one highlighted word" look real caption apps
  // use for emphasis, without needing any real semantic analysis to pick which word matters.
  emphasisWord: {
    fontHook: 'Arial Black', fontCaption: 'Arial Black', sizeHook: 78, sizeCaption: 72,
    bold: -1, italic: 0, spacing: 0, borderStyle: 1, outline: 5, shadow: 0,
    upperCase: false, animate: false, motion: 'emphasisWord', colorRole: 'outline', defaultAccent: '#FFD60A',
    backColor: '&H80000000',
  },
};

export const CAPTION_STYLES: CaptionStyleName[] = Object.keys(PRESETS) as CaptionStyleName[];

/** Translated caption text has no real per-word timing of its own (the words replacing the
 * original transcript are a different language, different word count/lengths) — rather than
 * faking evenly-spaced timing and presenting it as if real, translations render motion caption
 * styles as their nearest static equivalent. Every other style is returned unchanged. */
export function staticFallbackFor(style: CaptionStyleName | undefined): CaptionStyleName | undefined {
  if (!style) return style;
  return PRESETS[style].motion === 'none' ? style : 'bold';
}

const HOOK_DURATION = 2.5;
const CTA_DURATION = 2.5;
/** Whole-line pop-in scale, for the "kinetic" preset only. */
const KINETIC_PREFIX = '{\\t(0,120,\\fscx112\\fscy112)\\t(120,220,\\fscx100\\fscy100)}';
/** A punchier spring-style pop (starts small, overshoots past 100%, settles) — used per word by
 * both motion styles, so each word visibly *lands* instead of just fading up. `targetScalePct`
 * lets a manual per-word scale override (see WordFormatOverride) win the animation's final
 * resting size instead of always settling back to a hardcoded 100 — the overshoot scales
 * proportionally so the "spring" still reads the same regardless of the target size. */
function popTransform(startMs: number, targetScalePct: number = 100): string {
  const overshoot = startMs + 90;
  const settle = startMs + 170;
  // The original fixed pop overshot to 125% before settling at 100% (a 1.25x ratio) — preserve
  // that same proportional overshoot relative to whatever the word's own target scale is, so the
  // default (targetScalePct=100) is byte-identical to the old hardcoded 125/100 literals.
  const overshootPct = Math.round(targetScalePct * 1.25);
  return `\\fscx55\\fscy55\\t(${startMs},${overshoot},\\fscx${overshootPct}\\fscy${overshootPct})\\t(${overshoot},${settle},\\fscx${targetScalePct}\\fscy${targetScalePct})`;
}

/** A single word's manual formatting override (see EditCaptionsScreen on mobile) — layered on top
 * of whatever automatic style/motion is active. Keyed by `start` (seconds), not an array index or
 * synthetic id: `words` arrays get rechunked differently per render path (regroupForMotion's
 * tighter bursts vs. buildCaptionCues' per-cue grouping), so a positional index computed one way
 * in the caption-words route and another way in here would silently misalign. `start` is unique
 * per word (words never overlap in time) and untouched by any regrouping. */
export type WordFormatOverride = {
  start: number;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  highlightColor?: string;
  scale?: number;
};

type OverrideContext = {
  colorReset: string;
  boldReset: string;
  italicReset: string;
  outlineColorReset: string;
  outlineWidthReset: number;
};

/** Wraps one word's already-escaped text in whichever inline ASS override tags its manual
 * WordFormatOverride sets, each reset back to the line's own real baseline right after (never a
 * hardcoded reset — see buildAssFile's OverrideContext construction for why that matters). A
 * no-op (returns the text unchanged) when there's no override or every field on it is unset. */
function applyWordOverride(escapedText: string, o: WordFormatOverride | undefined, ctx: OverrideContext): string {
  if (!o) return escapedText;
  const open: string[] = [];
  const close: string[] = [];
  if (o.bold !== undefined) {
    open.push(`\\b${o.bold ? 1 : 0}`);
    close.push(ctx.boldReset);
  }
  if (o.italic !== undefined) {
    open.push(`\\i${o.italic ? 1 : 0}`);
    close.push(ctx.italicReset);
  }
  if (o.color) {
    open.push(`\\c${hexToInlineAssColor(o.color)}`);
    close.push(`\\c${ctx.colorReset}`);
  }
  if (o.highlightColor) {
    // Not a filled background pill (ASS has no per-word inline box tag, and splitting a shared
    // Dialogue line to fake one needs text-width measurement libass doesn't expose) — a strong
    // colored outline/glow via the same \bord/\3c tag family already used for the Style row's own
    // outline. Real and functional everywhere, no line-splitting risk.
    open.push(`\\bord6\\3c${hexToInlineAssColor(o.highlightColor)}`);
    close.push(`\\bord${ctx.outlineWidthReset}\\3c${ctx.outlineColorReset}`);
  }
  if (o.scale) {
    open.push(`\\fscx${o.scale}\\fscy${o.scale}`);
    close.push('\\fscx100\\fscy100');
  }
  return open.length === 0 ? escapedText : `{${open.join('')}}${escapedText}{${close.join('')}}`;
}

/** Rebuilds a static (non-motion) cue's Dialogue text word-by-word instead of joining the
 * pre-flattened cue.text, so manual per-word overrides can be applied. Byte-identical to the old
 * `escapeAssText(applyCase(cue.text))` when no word in this cue has an override, since
 * `cue.text === words.map(w => w.text).join(' ')` and escapeAssText/applyCase both commute with a
 * space-join. */
function buildStaticCueText(
  words: Word[],
  upperCase: boolean,
  overrideByStart: Map<number, WordFormatOverride>,
  ctx: OverrideContext,
): string {
  return words
    .map((w) => {
      const text = escapeAssText(upperCase ? w.text.toUpperCase() : w.text);
      const override = overrideByStart.get(Math.round(w.start * 1000));
      return applyWordOverride(text, override, ctx);
    })
    .join(' ');
}

/** Builds one ASS Dialogue Text field for "karaoke" motion: the accent color sweeps across each
 * word via \k<centiseconds> as it's actually spoken, AND each word gets its own scale-pop landing
 * right as the sweep reaches it (a local \t transform timed in ms-from-line-start, computed from
 * the same running cursor \k timing uses). \k durations are cumulative from the line's own start
 * and must sum to the real elapsed time — any silent gap before a word is folded into that word's
 * own duration (there's nowhere else to put idle time in \k timing) so the sweep lands on the
 * real audio instead of drifting. */
function buildKaraokeText(
  words: Word[],
  cueStart: number,
  upperCase: boolean,
  overrideByStart: Map<number, WordFormatOverride>,
  ctx: OverrideContext,
): string {
  let cursor = cueStart;
  const parts: string[] = [];
  for (const word of words) {
    const gap = Math.max(0, word.start - cursor);
    const duration = Math.max(0, word.end - word.start);
    const centiseconds = Math.max(1, Math.round((gap + duration) * 100));
    const startMs = Math.round((cursor + gap - cueStart) * 1000);
    const override = overrideByStart.get(Math.round(word.start * 1000));
    const text = applyWordOverride(escapeAssText(upperCase ? word.text.toUpperCase() : word.text), override, ctx);
    parts.push(`{\\k${centiseconds}${popTransform(startMs, override?.scale ?? 100)}}${text}`);
    cursor = word.end;
  }
  return parts.join(' ');
}

/** Builds one static-phrase Dialogue Text field for "emphasisWord" motion: every word renders at
 * the line's normal color except the single longest word (a simple, real proxy for "the word
 * that matters most" without any actual semantic analysis), which gets wrapped in an inline \c
 * override to the accent color and reset back afterward. */
function buildEmphasisText(
  words: Word[],
  upperCase: boolean,
  emphasisColorInline: string,
  overrideByStart: Map<number, WordFormatOverride>,
  ctx: OverrideContext,
): string {
  let longestIndex = 0;
  let longestLength = 0;
  words.forEach((w, i) => {
    const letters = w.text.replace(/[^\p{L}\p{N}]/gu, '').length;
    if (letters > longestLength) {
      longestLength = letters;
      longestIndex = i;
    }
  });

  return words
    .map((w, i) => {
      const text = escapeAssText(upperCase ? w.text.toUpperCase() : w.text);
      const override = overrideByStart.get(Math.round(w.start * 1000));
      // A manual override's own color (explicit user intent) wins over the automatic
      // longest-word heuristic recolor; bold/italic/highlight/scale from the override always
      // apply regardless of which word is "longest."
      if (override?.color) return applyWordOverride(text, override, ctx);
      if (i === longestIndex) {
        const withoutColor = applyWordOverride(text, { ...override, start: w.start, color: undefined }, ctx);
        return `{\\c${emphasisColorInline}}${withoutColor}{\\c&H00FFFFFF&}`;
      }
      return applyWordOverride(text, override, ctx);
    })
    .join(' ');
}

/** Builds a full .ass subtitle file: a "Hook" headline for the first ~3s, word-group captions in
 * between, and an optional CTA line burned into the last ~2.5s of the clip. */
export function buildAssFile(
  hookText: string,
  captionCues: CaptionCue[],
  clipDurationSec: number,
  ctaText?: string,
  accentColorHex?: string,
  styleName: CaptionStyleName = 'bold',
  wordOverrides: WordFormatOverride[] = [],
): string {
  const preset = PRESETS[styleName];
  const accent = accentColorHex ?? preset.defaultAccent;
  const accentAss = hexToAssColor(accent);
  // "emphasisWord" always uses a plain white-on-black-outline base — the accent color is reserved
  // entirely for the one recolored word (see the emphasisWord render branch below), not for the
  // Style row's fill/outline the way every other preset's colorRole does.
  const isEmphasisWord = preset.motion === 'emphasisWord';
  const primaryColor = isEmphasisWord ? '&H00FFFFFF' : preset.colorRole === 'fill' ? accentAss : '&H00FFFFFF';
  const outlineColor = isEmphasisWord ? '&H00000000' : preset.colorRole === 'outline' ? accentAss : '&H00000000';
  // Only "karaoke" needs a distinct SecondaryColour (the "not yet locked in" color a word shows
  // while its own \k timer is still running) — every other style keeps Primary===Secondary, a
  // no-op without any \k tags in the text.
  const secondaryColor = preset.motion === 'karaoke' ? '&H00FFFFFF' : primaryColor;

  // Manual per-word overrides (EditCaptionsScreen on mobile) are keyed by millisecond-rounded
  // `start` to avoid float-equality bugs. Resets always read the STYLE's own real baseline (not a
  // hardcoded off) — see applyWordOverride's doc comment for why that matters for \b/\i.
  const overrideByStart = new Map(wordOverrides.map((o) => [Math.round(o.start * 1000), o]));
  const overrideCtx: OverrideContext = {
    colorReset: `${primaryColor}&`,
    boldReset: preset.bold === -1 ? '\\b1' : '\\b0',
    italicReset: preset.italic === -1 ? '\\i1' : '\\i0',
    outlineColorReset: `${outlineColor}&`,
    outlineWidthReset: preset.outline,
  };

  // The hook headline always gets its own fixed window up front, and the CTA (if any) gets one at
  // the end. Real captions are pushed out of the hook window and clipped before the CTA window —
  // never dropped, just kept from fighting either for screen time.
  const ctaStart = ctaText ? Math.max(HOOK_DURATION, clipDurationSec - CTA_DURATION) : clipDurationSec;
  const clip = <T extends { start: number; end: number }>(item: T): T => ({
    ...item,
    start: Math.max(item.start, HOOK_DURATION),
    end: Math.min(item.end, ctaStart),
  });

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Hook,${preset.fontHook},${preset.sizeHook},${primaryColor},${primaryColor},${outlineColor},${preset.backColor},${preset.bold},${preset.italic},0,0,100,100,${preset.spacing},0,${preset.borderStyle},${preset.outline},${preset.shadow},8,60,60,140,1
Style: Caption,${preset.fontCaption},${preset.sizeCaption},${primaryColor},${secondaryColor},${outlineColor},${preset.backColor},${preset.bold},${preset.italic},0,0,100,100,${preset.spacing},0,${preset.borderStyle},${preset.outline},${preset.shadow},2,60,60,180,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const applyCase = (text: string) => (preset.upperCase ? text.toUpperCase() : text);
  const animPrefix = preset.animate ? KINETIC_PREFIX : '';

  const lines: string[] = [];
  lines.push(
    `Dialogue: 0,${formatAssTime(0)},${formatAssTime(HOOK_DURATION)},Hook,,0,0,0,,${animPrefix}${escapeAssText(applyCase(hookText))}`,
  );

  if (preset.motion === 'none' || preset.motion === 'emphasisWord') {
    const cues = captionCues.map(clip).filter((cue) => cue.end - cue.start > 0.05);
    for (const cue of cues) {
      const text =
        preset.motion === 'emphasisWord'
          ? buildEmphasisText(cue.words, preset.upperCase, hexToInlineAssColor(accent), overrideByStart, overrideCtx)
          : `${animPrefix}${buildStaticCueText(cue.words, preset.upperCase, overrideByStart, overrideCtx)}`;
      lines.push(`Dialogue: 0,${formatAssTime(cue.start)},${formatAssTime(cue.end)},Caption,,0,0,0,,${text}`);
    }
  } else {
    // Real motion-caption apps show only 1-2 words at a time, not a whole ~4-word phrase — regroup
    // the flattened word stream at that tighter granularity before rendering either motion style.
    const groups = regroupForMotion(captionCues.flatMap((c) => c.words))
      .map(clip)
      .filter((g) => g.end - g.start > 0.05);

    for (const group of groups) {
      if (preset.motion === 'karaoke') {
        const karaokeText = buildKaraokeText(group.words, group.start, preset.upperCase, overrideByStart, overrideCtx);
        lines.push(`Dialogue: 0,${formatAssTime(group.start)},${formatAssTime(group.end)},Caption,,0,0,0,,${karaokeText}`);
      } else {
        for (const word of group.words) {
          const wordStart = Math.max(word.start, group.start);
          const wordEnd = Math.min(word.end, group.end);
          if (wordEnd - wordStart <= 0.02) continue;
          const override = overrideByStart.get(Math.round(word.start * 1000));
          const text = applyWordOverride(escapeAssText(applyCase(word.text)), override, overrideCtx);
          lines.push(
            `Dialogue: 0,${formatAssTime(wordStart)},${formatAssTime(wordEnd)},Caption,,0,0,0,,{${popTransform(0, override?.scale ?? 100)}}${text}`,
          );
        }
      }
    }
  }

  if (ctaText) {
    lines.push(
      `Dialogue: 0,${formatAssTime(ctaStart)},${formatAssTime(clipDurationSec)},Caption,,0,0,0,,${animPrefix}${escapeAssText(applyCase(ctaText))}`,
    );
  }

  return header + lines.join('\n') + '\n';
}
