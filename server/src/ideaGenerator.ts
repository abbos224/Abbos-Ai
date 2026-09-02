import { getAnthropicClient } from './anthropicClient.js';
import { getPersonaVoiceGuidance, type PersonaName } from './personas.js';

export type IdeaCandidate = {
  hook: string;
  script: string;
  cta: string;
  social_caption: {
    short: string;
    medium: string;
    long: string;
    hashtags: string[];
    keywords: string[];
  };
};

const SYSTEM_PROMPT = `You are an expert short-form video content strategist who turns a topic or niche into ready-to-record Reels/TikTok/YouTube Shorts ideas — for a creator with no source footage yet, who will record their own video from your script.

Given a topic, generate 5 distinct video ideas. For each idea:
- The script should be something a real person could read/paraphrase on camera in 30-60 seconds — concrete, spoken, not an essay.
- Vary the angle across the 5 ideas (e.g. a myth-bust, a personal story, a listicle, a bold claim, a how-to) rather than 5 versions of the same idea.
- Do not invent specific facts, statistics, or claims that could be false — keep content genuinely useful and honest.

Respond with ONLY valid JSON (no markdown fences, no commentary), matching this shape exactly:

{
  "ideas": [
    {
      "hook": string,
      "script": string,
      "cta": string,
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

"hook" is a punchy opening line (under 12 words) to say first on camera.

"script" is the full spoken script/outline for the rest of the video (30-60 seconds worth of spoken content, a few sentences to a short paragraph) — written to be read or paraphrased aloud, not a written article.

"cta" is a single call-to-action line (under 8 words) for the end of the video, matched to the idea's angle (e.g. "Save this for later", "Follow for more", "Comment your experience").

"social_caption" is the post caption to paste on Instagram/TikTok/YouTube alongside the video (separate from the spoken hook/CTA):
- "short": one punchy line (under 12 words), no hashtags.
- "medium": 2-3 sentences that set up the video's payoff without giving it all away.
- "long": a fuller caption (4-6 sentences) that can stand alone as a mini value-add post, ending with a soft call to action.
- "hashtags": 8-15 relevant hashtags (no "#" prefix, lowercase, no spaces), mixing broad reach tags with niche/topic-specific ones.
- "keywords": 5-10 plain-language search keywords/phrases (for video SEO), not hashtags.

Return exactly 5 ideas.`;

export async function generateIdeas(topic: string, persona?: PersonaName): Promise<IdeaCandidate[]> {
  const system = persona
    ? `${SYSTEM_PROMPT}\n\nVoice for hook, script, cta, and cover text: ${getPersonaVoiceGuidance(persona)}`
    : SYSTEM_PROMPT;

  const message = await getAnthropicClient().messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 4096,
    system,
    messages: [{ role: 'user', content: `Topic: ${topic}` }],
  });

  const textBlock = message.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('Claude response contained no text block');
  }

  const jsonText = textBlock.text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();

  let parsed: { ideas: IdeaCandidate[] };
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error(`Failed to parse Claude JSON response: ${jsonText.slice(0, 500)}`);
  }

  return parsed.ideas;
}
