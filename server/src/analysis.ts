import { getAnthropicClient } from './anthropicClient.js';
import type { Word } from './transcription.js';
import type { ClipScore } from './store.js';
import { getPersonaVoiceGuidance, type PersonaName } from './personas.js';

export type Sentence = { start: number; end: number; text: string };

export type SocialCaption = {
  short: string;
  medium: string;
  long: string;
  hashtags: string[];
  keywords: string[];
};

export type ClipCandidate = {
  start_sec: number;
  end_sec: number;
  topic: string;
  score_breakdown: ClipScore;
  hook_options: string[];
  cta: string;
  cover_options: string[];
  social_caption: SocialCaption;
};

/** Groups words into sentence-like chunks on punctuation boundaries, for a compact transcript. */
export function groupIntoSentences(words: Word[]): Sentence[] {
  const sentences: Sentence[] = [];
  let buffer: Word[] = [];

  for (const word of words) {
    buffer.push(word);
    const endsSentence = /[.!?]$/.test(word.text);
    if (endsSentence) {
      sentences.push({
        start: buffer[0].start,
        end: buffer[buffer.length - 1].end,
        text: buffer.map((w) => w.text).join(' '),
      });
      buffer = [];
    }
  }
  if (buffer.length > 0) {
    sentences.push({
      start: buffer[0].start,
      end: buffer[buffer.length - 1].end,
      text: buffer.map((w) => w.text).join(' '),
    });
  }
  return sentences;
}

function formatTranscript(sentences: Sentence[]): string {
  return sentences
    .map((s) => `[${s.start.toFixed(1)}-${s.end.toFixed(1)}] ${s.text}`)
    .join('\n');
}

const SYSTEM_PROMPT = `You are an expert short-form video editor who finds the most "clippable" moments in long-form video transcripts (interviews, podcasts, lectures) for Instagram Reels / TikTok / YouTube Shorts.

Given a timestamped transcript, identify the best candidate clips. For each clip:
- Prefer segments with a strong hook, a clear standalone idea, emotion, conflict, a surprising claim, or a concrete takeaway.
- Clips should be 15-60 seconds long and start/end on natural sentence boundaries from the transcript timestamps.
- Do not invent facts that are not in the transcript.

Respond with ONLY valid JSON (no markdown fences, no commentary), matching this shape exactly:

{
  "clips": [
    {
      "start_sec": number,
      "end_sec": number,
      "topic": string,
      "score_breakdown": {
        "hook": number,
        "retention": number,
        "emotion": number,
        "clarity": number,
        "shareability": number,
        "cta": number
      },
      "hook_options": [string, string, string],
      "cta": string,
      "cover_options": [string, string, string],
      "social_caption": {
        "short": string,
        "medium": string,
        "long": string,
        "hashtags": [string, ...],
        "keywords": [string, ...]
      }
    }
  ]
}

Each score is 0-100, representing your estimate of that clip's potential, not a promise of real views. hook_options are three alternative punchy opening lines (under 12 words) that could replace the clip's actual opening line to make it more attention-grabbing.

"cta" is a single call-to-action line (under 8 words) for the very end of the clip, matched to the content type — e.g. "Save this video" for an educational tip, "Follow for more" for a personal/blog moment, "DM us to learn more" for a business/service pitch, "Book a consultation" for a professional service, "Comment your thoughts" for something opinion-driven. Pick whichever fits, don't default to the same one every time.

"cover_options" are three short, punchy cover/thumbnail titles (under 6 words, title-case, no ending punctuation) that would work as bold on-screen text over a paused frame of the clip — think "3 Buyer Mistakes" or "Don't Sign Yet", not a full sentence.

"social_caption" is the post caption to paste on Instagram/TikTok/YouTube alongside the video (separate from the on-screen hook/CTA burned into the clip itself):
- "short": one punchy line (under 12 words), no hashtags.
- "medium": 2-3 sentences that set up the clip's payoff without giving it all away, encouraging a watch-through.
- "long": a fuller caption (4-6 sentences) that can stand alone as a mini value-add post, ending with a soft call to action.
- "hashtags": 8-15 relevant hashtags (no "#" prefix, lowercase, no spaces), mixing broad reach tags with niche/topic-specific ones.
- "keywords": 5-10 plain-language search keywords/phrases (for video SEO / alt text), not hashtags.

Return between 3 and 10 clips, ordered by overall potential descending.`;

export async function findBestClips(
  words: Word[],
  durationSec: number,
  persona?: PersonaName,
): Promise<ClipCandidate[]> {
  const sentences = groupIntoSentences(words);
  const transcript = formatTranscript(sentences);
  const system = persona
    ? `${SYSTEM_PROMPT}\n\nVoice for hook_options, cta, and cover_options: ${getPersonaVoiceGuidance(persona)}`
    : SYSTEM_PROMPT;

  const message = await getAnthropicClient().messages.create({
    model: 'claude-sonnet-5',
    // Bumped from 4096: social_caption (short/medium/long + hashtags + keywords) adds real
    // output size per clip, and up to 10 clips can come back in one response.
    max_tokens: 8192,
    system,
    messages: [
      {
        role: 'user',
        content: `Video duration: ${durationSec.toFixed(1)} seconds.\n\nTranscript:\n${transcript}`,
      },
    ],
  });

  const textBlock = message.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('Claude response contained no text block');
  }

  const jsonText = textBlock.text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();

  let parsed: { clips: ClipCandidate[] };
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error(`Failed to parse Claude JSON response: ${jsonText.slice(0, 500)}`);
  }

  return parsed.clips;
}
