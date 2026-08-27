import fs from 'node:fs';
import path from 'node:path';
import { getAnthropicClient } from './anthropicClient.js';
import { extractFrame } from './ffmpegRunner.js';
import type { Word } from './transcription.js';

export type SpeakerTurn = { speaker: string; start: number; end: number };

/**
 * Collapses consecutive same-speaker words into turns, merging any turn shorter than
 * `minTurnDuration` into a neighboring turn. This avoids flicker-cutting the crop on noisy
 * diarization boundaries (a word or two briefly misattributed to the other speaker).
 */
export function groupIntoSpeakerTurns(words: Word[], minTurnDuration = 1.0): SpeakerTurn[] {
  const withSpeaker = words.filter((w): w is Word & { speaker: string } => w.speaker != null);
  if (withSpeaker.length === 0) return [];

  const rawTurns: SpeakerTurn[] = [];
  for (const word of withSpeaker) {
    const last = rawTurns[rawTurns.length - 1];
    if (last && last.speaker === word.speaker) {
      last.end = word.end;
    } else {
      rawTurns.push({ speaker: word.speaker, start: word.start, end: word.end });
    }
  }

  const merged: SpeakerTurn[] = [];
  for (const turn of rawTurns) {
    const isShort = turn.end - turn.start < minTurnDuration;
    const prev = merged[merged.length - 1];
    if (isShort && prev) {
      prev.end = turn.end;
    } else {
      merged.push({ ...turn });
    }
  }
  // A too-short leading turn has no earlier turn to merge into — absorb it into the next one.
  if (merged.length > 1 && merged[0].end - merged[0].start < minTurnDuration) {
    merged[1].start = merged[0].start;
    merged.shift();
  }

  return coalesceSameSpeaker(merged);
}

function coalesceSameSpeaker(turns: SpeakerTurn[]): SpeakerTurn[] {
  const out: SpeakerTurn[] = [];
  for (const turn of turns) {
    const last = out[out.length - 1];
    if (last && last.speaker === turn.speaker) {
      last.end = turn.end;
    } else {
      out.push({ ...turn });
    }
  }
  return out;
}

async function askVisionForSpeakerPosition(framePath: string): Promise<number | null> {
  const imageBase64 = fs.readFileSync(framePath).toString('base64');

  const message = await getAnthropicClient().messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 300,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: imageBase64 } },
          {
            type: 'text',
            text:
              "This is a still frame from a video with one or more people in it, taken at a " +
              "moment when one specific person is the active speaker. Find that active speaker " +
              "using whichever cue is present: an on-screen active-speaker highlight/border " +
              "(common in Zoom/Riverside/Streamyard-style recordings), open mouth or mid-gesture, " +
              "or — if only one person is visible at all — that person by default. Respond with " +
              "ONLY a number between 0 and 1: that person's horizontal center as a fraction of " +
              "the image width (0 = left edge, 1 = right edge). No words, no explanation — just " +
              "the number.",
          },
        ],
      },
    ],
  });

  const textBlock = message.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    console.log(`[speakerFraming] vision call returned no text (stop_reason=${message.stop_reason})`);
    return null;
  }

  const value = parseFloat(textBlock.text.trim());
  if (Number.isNaN(value) || value < 0 || value > 1) return null;
  return value;
}

/**
 * For each distinct speaker in `turns`, samples one representative frame (midpoint of their
 * longest turn) from `clipFile` and asks Claude vision where that speaker sits on screen.
 * Returns an empty/partial map on failure — callers should fall back to a static crop for any
 * speaker missing from the result rather than fail the whole render.
 */
export async function detectSpeakerPositions(
  clipFile: string,
  turns: SpeakerTurn[],
  workDir: string,
): Promise<Map<string, number>> {
  const positions = new Map<string, number>();
  const speakers = [...new Set(turns.map((t) => t.speaker))];
  if (speakers.length < 2) return positions;

  for (const speaker of speakers) {
    const speakerTurns = turns.filter((t) => t.speaker === speaker);
    const longest = speakerTurns.reduce((a, b) => (b.end - b.start > a.end - a.start ? b : a));
    const midpoint = (longest.start + longest.end) / 2;

    try {
      const framePath = path.join(workDir, `speaker_${speaker}.png`);
      await extractFrame(clipFile, midpoint, framePath);
      const xFraction = await askVisionForSpeakerPosition(framePath);
      if (xFraction != null) positions.set(speaker, xFraction);
    } catch (err) {
      console.log(`[speakerFraming] failed to position speaker ${speaker}: ${err instanceof Error ? err.message : err}`);
      // leave this speaker unpositioned — caller decides whether to fall back
    }
  }

  return positions;
}
