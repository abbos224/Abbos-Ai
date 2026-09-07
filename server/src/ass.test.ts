import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCaptionCues, buildAssFile, CAPTION_STYLES } from './ass.js';
import type { Word } from './transcription.js';

function word(text: string, start: number, end: number): Word {
  return { text, start, end };
}

test('buildCaptionCues: groups words up to 4 per cue', () => {
  const words = [
    word('this', 0, 0.2),
    word('is', 0.2, 0.4),
    word('a', 0.4, 0.5),
    word('test', 0.5, 0.8),
    word('sentence', 0.8, 1.2),
  ];

  const cues = buildCaptionCues(words);

  assert.equal(cues.length, 2);
  assert.equal(cues[0].text, 'this is a test');
  assert.equal(cues[0].start, 0);
  assert.equal(cues[0].end, 0.8);
  assert.equal(cues[1].text, 'sentence');
});

test('buildCaptionCues: flushes early on sentence-ending punctuation', () => {
  const words = [word('hi.', 0, 0.3), word('there', 0.3, 0.6)];

  const cues = buildCaptionCues(words);

  assert.equal(cues.length, 2);
  assert.equal(cues[0].text, 'hi.');
  assert.equal(cues[1].text, 'there');
});

test('buildCaptionCues: flushes when a cue would exceed ~2.2s even with few words', () => {
  const words = [word('long', 0, 1.5), word('pause', 1.5, 2.5)];

  const cues = buildCaptionCues(words);

  assert.equal(cues.length, 1);
  assert.equal(cues[0].text, 'long pause');
  assert.equal(cues[0].end, 2.5);
});

test('buildCaptionCues: returns an empty array for no words', () => {
  assert.deepEqual(buildCaptionCues([]), []);
});

test('buildAssFile: burns a CTA line into the last ~2.5s and clips regular captions before it', () => {
  const cues = [{ start: 5, end: 11, text: 'RUNS RIGHT UP TO THE END', words: [] }];

  const ass = buildAssFile('hook text', cues, 12, 'save this video');

  assert.match(ass, /SAVE THIS VIDEO/);
  // The CTA dialogue line should start at duration - 2.5 = 9.5s.
  assert.match(ass, /Dialogue: 0,0:00:09\.50,0:00:12\.00,Caption,,0,0,0,,SAVE THIS VIDEO/);
  // The regular caption cue (5-11s) must not extend past where the CTA window starts (9.5s).
  assert.doesNotMatch(ass, /0:00:1[01]\.\d\d,Caption,,0,0,0,,RUNS RIGHT UP TO THE END/);
});

test('buildAssFile: omits the CTA line entirely when no ctaText is given', () => {
  const ass = buildAssFile('hook text', [], 12);
  assert.equal((ass.match(/Dialogue:/g) ?? []).length, 1); // just the hook line
});

test('buildAssFile: every caption style preset produces a valid, uppercase-consistent .ass file', () => {
  const cues = [{ start: 3, end: 4.5, text: 'check this before you sign', words: [] }];

  for (const style of CAPTION_STYLES) {
    const ass = buildAssFile('nobody tells you this', cues, 6, undefined, undefined, style);

    assert.match(ass, /^\[Script Info\]/);
    assert.match(ass, /\[V4\+ Styles\]/);
    assert.match(ass, /\[Events\]/);
    assert.match(ass, /Style: Hook,/);
    assert.match(ass, /Style: Caption,/);
    // The Hook line's casing is unaffected by motion styles (hook text isn't word-timed transcript
    // data). Everything except 'minimal', 'podcast', 'luxury' and 'emphasisWord' upper-cases.
    const naturalCaseStyles: (typeof style)[] = ['minimal', 'podcast', 'luxury', 'emphasisWord'];
    if (naturalCaseStyles.includes(style)) {
      assert.match(ass, /nobody tells you this/);
    } else {
      assert.match(ass, /NOBODY TELLS YOU THIS/);
    }
  }
});

test('buildAssFile: "karaoke" style emits per-word \\k tags (with a scale-pop) summing to each word\'s real timing', () => {
  const words: Word[] = [word('this', 3, 3.2), word('is', 3.3, 3.5), word('karaoke', 3.5, 4.1)];
  const cues = [{ start: 3, end: 4.1, text: 'this is karaoke', words }];

  const ass = buildAssFile('hook', cues, 6, undefined, '#22D3EE', 'karaoke');

  // "this": no gap before it (starts exactly at cue start) -> (3.2-3)*100 = 20cs.
  assert.match(ass, /\\k20\\.*THIS/);
  // "is": gap 3.3-3.2=0.1s folded in -> (0.1 + 0.2)*100 = 30cs.
  assert.match(ass, /\\k30\\.*IS/);
  // regroupForMotion caps a group at 2 words, so "karaoke" starts a fresh group/line — no gap
  // (3.5-3.5=0) -> (4.1-3.5)*100 = 60cs.
  assert.match(ass, /\\k60\\.*KARAOKE/);
  // Every word also gets its own scale-pop landing (a spring overshoot), not just a flat color
  // swap — this is what makes it read as "motion" rather than a static highlight.
  assert.match(ass, /\\t\(0,90,\\fscx125\\fscy125\)/);
  // Distinct Secondary colour (the "not yet locked in" color) is only set for karaoke.
  assert.match(ass, /Style: Caption,.*,&H00FFFFFF,&H00000000,/);
});

test('buildAssFile: motion styles regroup into 1-2-word bursts, not the ~4-word static grouping', () => {
  const words: Word[] = [
    word('one', 3, 3.2), word('two', 3.2, 3.4), word('three', 3.4, 3.6), word('four', 3.6, 3.8),
  ];
  const cues = [{ start: 3, end: 3.8, text: 'one two three four', words }];

  const ass = buildAssFile('hook', cues, 6, undefined, undefined, 'karaoke');
  const captionLines = ass.split('\n').filter((l) => l.startsWith('Dialogue') && l.includes(',Caption,'));
  // 4 words at 2-per-group caps out at 2 groups/lines, not 1 (which the old ~4-word static
  // grouping would have produced).
  assert.equal(captionLines.length, 2);
});

test('buildAssFile: "wordPop" style emits one Dialogue line per word instead of per cue', () => {
  const words: Word[] = [word('pop', 3, 3.3), word('each', 3.4, 3.7), word('word', 3.7, 4.0)];
  const cues = [{ start: 3, end: 4.0, text: 'pop each word', words }];

  const ass = buildAssFile('hook', cues, 6, undefined, undefined, 'wordPop');

  const captionLines = ass.split('\n').filter((l) => l.startsWith('Dialogue') && l.includes(',Caption,'));
  assert.equal(captionLines.length, 3);
  assert.match(captionLines[0], /POP/);
  assert.match(captionLines[1], /EACH/);
  assert.match(captionLines[2], /WORD/);
});

test('buildAssFile: "highlightBox" uses BorderStyle 3 (opaque box) with the accent as the box color', () => {
  const words: Word[] = [word('hi', 3, 3.3)];
  const cues = [{ start: 3, end: 3.3, text: 'hi', words }];

  const ass = buildAssFile('hook', cues, 6, undefined, '#7C3AED', 'highlightBox');

  // BorderStyle=3 with a large Outline value is what makes the "outline" colour render as a solid
  // box behind the text instead of a stroke.
  assert.match(ass, /Style: Caption,.*,3,24,0,2,/);
  // #7C3AED -> BGR -> &H00ED3A7C, used as the box (OutlineColour) fill.
  assert.match(ass, /&H00ED3A7C/i);
});

test('buildAssFile: "emphasisWord" recolors only the longest word in each static phrase', () => {
  const words: Word[] = [word('check', 3, 3.3), word('this', 3.3, 3.5), word('immediately', 3.5, 4.2)];
  const cues = [{ start: 3, end: 4.2, text: 'check this immediately', words }];

  const ass = buildAssFile('hook', cues, 6, undefined, '#FFD60A', 'emphasisWord');

  // "immediately" (11 letters) is the longest word — only it gets wrapped in the inline color
  // override (#FFD60A -> &H0AD6FF&), reset back to white right after.
  assert.match(ass, /check this \{\\c&H0AD6FF&\}immediately\{\\c&H00FFFFFF&\}/);
});

test('buildAssFile: an explicit accent color overrides the preset default', () => {
  const ass = buildAssFile('hook', [], 6, undefined, '#123ABC', 'bold');
  // #123ABC -> ASS BGR with 00 alpha prefix -> &H00BC3A12
  assert.match(ass, /&H00BC3A12/i);
});

// --- Manual per-word formatting overrides (EditCaptionsScreen) ---

test('buildAssFile: static-path color override wraps only the targeted word', () => {
  const words: Word[] = [word('check', 3, 3.3), word('this', 3.3, 3.5), word('now', 3.5, 3.8)];
  const cues = [{ start: 3, end: 3.8, text: 'check this now', words }];

  const ass = buildAssFile('hook', cues, 6, undefined, undefined, 'bold', [{ start: 3.3, color: '#FF0000' }]);

  // "bold" preset: colorRole 'outline' -> primary fill stays white (&H00FFFFFF), so the reset
  // after the override must go back to that real primary color, not a hardcoded value.
  assert.match(ass, /CHECK \{\\c&H0000FF&\}THIS\{\\c&H00FFFFFF&\} NOW/);
});

test("buildAssFile: bold/italic inline overrides reset to the STYLE's own baseline, not a hardcoded off", () => {
  const words: Word[] = [word('flag', 3, 3.3), word('this', 3.4, 3.6)];
  const cues = [{ start: 3, end: 3.6, text: 'flag this', words }];

  // "gaming" has a bold BASELINE (-1) — temporarily un-bolding one word must reset back to \b1,
  // not a hardcoded \b0, or the rest of the line would silently lose its own boldness.
  const gamingAss = buildAssFile('hook', cues, 6, undefined, undefined, 'gaming', [{ start: 3, bold: false }]);
  assert.match(gamingAss, /\{\\b0\}FLAG\{\\b1\}/);

  // "minimal" has a non-bold baseline (0) — forcing one word bold resets back to \b0.
  const minimalAss = buildAssFile('hook', cues, 6, undefined, undefined, 'minimal', [{ start: 3, bold: true }]);
  assert.match(minimalAss, /\{\\b1\}flag\{\\b0\}/);

  // "podcast" has an italic BASELINE (-1) — temporarily un-italicizing one word resets back to
  // \i1, not a hardcoded \i0.
  const podcastAss = buildAssFile('hook', cues, 6, undefined, undefined, 'podcast', [{ start: 3, italic: false }]);
  assert.match(podcastAss, /\{\\i0\}flag\{\\i1\}/);
});

test('buildAssFile: "karaoke" color override layers alongside the \\k sweep, resets to the real primary color', () => {
  const words: Word[] = [word('boom', 3, 3.3)];
  const cues = [{ start: 3, end: 3.3, text: 'boom', words }];

  const ass = buildAssFile('hook', cues, 6, undefined, '#22D3EE', 'karaoke', [{ start: 3, color: '#FF0000' }]);

  // #22D3EE -> BGR -> &H00EED322, this style's real fill/primary color (colorRole 'fill'). The
  // \k/pop block is untouched (still the default 125% overshoot) — the override just layers a
  // second tag block right after it.
  assert.match(ass, /\\k\d+\\fscx55\\fscy55\\t\(0,90,\\fscx125\\fscy125\)\\t\(90,170,\\fscx100\\fscy100\)\}\{\\c&H0000FF&\}BOOM\{\\c&H00EED322&\}/);
});

test('buildAssFile: "wordPop" scale override changes both the override wrap AND the pop-in transform target', () => {
  const words: Word[] = [word('big', 3, 3.3)];
  const cues = [{ start: 3, end: 3.3, text: 'big', words }];

  const ass = buildAssFile('hook', cues, 6, undefined, undefined, 'wordPop', [{ start: 3, scale: 140 }]);

  // popTransform's own settle now targets 140 (not the hardcoded 100), overshoot scales
  // proportionally at the same 1.25x ratio the original fixed 125/100 literals used (140*1.25=175)
  // — proves the fix threads through, not just the wrap below.
  assert.match(ass, /\\t\(0,90,\\fscx175\\fscy175\)\\t\(90,170,\\fscx140\\fscy140\)/);
  // Style rows hardcode ScaleX/Y=100 unconditionally, so the override's own wrap always resets to 100.
  assert.match(ass, /\{\\fscx140\\fscy140\}BIG\{\\fscx100\\fscy100\}/);
});

test('buildAssFile: highlightColor override draws a colored outline/glow, reset to the real outline color+width', () => {
  const words: Word[] = [word('spark', 3, 3.3), word('word', 3.4, 3.6)];
  const cues = [{ start: 3, end: 3.6, text: 'spark word', words }];

  const ass = buildAssFile('hook', cues, 6, undefined, undefined, 'bold', [{ start: 3, highlightColor: '#7C3AED' }]);

  // #7C3AED -> BGR inline -> &HED3A7C&; "bold" preset's real outline is width 5, color black
  // (accent default '#000000' -> &H00000000) — the reset must read those, not a hardcoded value.
  assert.match(ass, /\{\\bord6\\3c&HED3A7C&\}SPARK\{\\bord5\\3c&H00000000&\} WORD/);
  // Only the targeted word gets the \bord6 highlight override — exactly one occurrence in the file.
  assert.equal((ass.match(/\\bord6/g) ?? []).length, 1);
});

test('buildAssFile: "emphasisWord" — a manual override color on the longest word wins over the automatic accent recolor', () => {
  const words: Word[] = [word('check', 3, 3.3), word('this', 3.3, 3.5), word('immediately', 3.5, 4.2)];
  const cues = [{ start: 3, end: 4.2, text: 'check this immediately', words }];

  const ass = buildAssFile('hook', cues, 6, undefined, '#FFD60A', 'emphasisWord', [{ start: 3.5, color: '#00FF00' }]);

  assert.match(ass, /check this \{\\c&H00FF00&\}immediately\{\\c&H00FFFFFF&\}/);
  // The accent's own inline color (&H0AD6FF&, from #FFD60A) never appears — fully replaced.
  assert.doesNotMatch(ass, /&H0AD6FF&/i);
});

test('buildAssFile: an override whose start matches no real word is a silent no-op', () => {
  const words: Word[] = [word('hello', 3, 3.3)];
  const cues = [{ start: 3, end: 3.3, text: 'hello', words }];

  const withStaleOverride = buildAssFile('hook', cues, 6, undefined, undefined, 'bold', [{ start: 99, color: '#FF0000' }]);
  const withNone = buildAssFile('hook', cues, 6, undefined, undefined, 'bold', []);

  assert.equal(withStaleOverride, withNone);
});

test('buildAssFile: omitting wordOverrides entirely is byte-identical to passing an empty array', () => {
  const words: Word[] = [word('a', 3, 3.2), word('b', 3.3, 3.6)];
  const cues = [{ start: 3, end: 3.6, text: 'a b', words }];

  for (const style of ['bold', 'emphasisWord'] as const) {
    const withDefaultParam = buildAssFile('hook', cues, 6, undefined, undefined, style);
    const withExplicitEmpty = buildAssFile('hook', cues, 6, undefined, undefined, style, []);
    assert.equal(withDefaultParam, withExplicitEmpty);
  }
});
