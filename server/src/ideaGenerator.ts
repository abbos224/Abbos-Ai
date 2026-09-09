import { getAnthropicClient } from './anthropicClient.js';
import { getPersonaVoiceGuidance, type PersonaName } from './personas.js';
import { ANTI_CLICHE_GUARDRAIL } from './promptGuardrails.js';

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

const TOPICS_SYSTEM_PROMPT = `You are an expert short-form video content strategist who turns a topic or niche into ready-to-record Reels/TikTok/YouTube Shorts ideas — for a creator with no source footage yet, who will record their own video from your script.

Given a topic, generate 5 distinct video ideas. For each idea:
- The script should be something a real person could read/paraphrase on camera in 30-60 seconds — concrete, spoken, not an essay.
- Vary the angle across the 5 ideas (e.g. a myth-bust, a personal story, a listicle, a bold claim, a how-to) rather than 5 versions of the same idea.
- Ground each script in something concrete and specific to this exact topic — a specific scenario, number, or decision point — not generic advice that could be copy-pasted onto a different topic with a find-and-replace.
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

"cta" is a single call-to-action line (under 8 words) for the end of the video, matched to the idea's angle — e.g. "Save this for later" for a reference-worthy tip, "Follow for more" for a series-style angle, "Comment your experience" for something opinion-driven, "Share with someone who needs this" for a relatable moment, "DM us to learn more" for a service/business pitch. Pick whichever fits, don't default to the same one across all 5 ideas.

"social_caption" is the post caption to paste on Instagram/TikTok/YouTube alongside the video (separate from the spoken hook/CTA):
- "short": one punchy line (under 12 words), no hashtags.
- "medium": 2-3 sentences that set up the video's payoff without giving it all away.
- "long": a fuller caption (4-6 sentences) that can stand alone as a mini value-add post, ending with a soft call to action.
- "hashtags": 8-15 relevant hashtags (no "#" prefix, lowercase, no spaces), mixing broad reach tags with niche/topic-specific ones.
- "keywords": 5-10 plain-language search keywords/phrases (for video SEO), not hashtags.

Return exactly 5 ideas.

${ANTI_CLICHE_GUARDRAIL}`;

export async function generateIdeas(topic: string, persona?: PersonaName): Promise<IdeaCandidate[]> {
  const parsed = await callClaude<{ ideas: IdeaCandidate[] }>(TOPICS_SYSTEM_PROMPT, topic, persona);
  return parsed.ideas;
}

// ---------------------------------------------------------------------------------------------
// Professional script mode — for a creator who already has the topic and wants one fully written,
// structured, ready-to-film script instead of 5 short pitches to choose between.
// ---------------------------------------------------------------------------------------------

export type ScriptSection = { label: string; script: string; visual_notes?: string };
export type ProfessionalScriptCandidate = {
  title: string;
  angle: string;
  sections: ScriptSection[];
  cta: string;
  estimated_duration_sec: number;
};

const SCRIPT_SYSTEM_PROMPT = `You are a professional video scriptwriter who writes complete, structured, ready-to-film scripts for short-form video (60-120 seconds) — for a creator who will film themselves reading/paraphrasing this, not an AI narrator.

Given a topic, write 3 distinct full scripts (different angles — e.g. a story-driven version, a listicle/tutorial version, a contrarian/myth-bust version). Each script is broken into labeled sections (e.g. "Hook", "Setup", "Point 1", "Point 2", "Payoff/CTA") so a creator can film it in pieces and edit later. Each section's "script" is exact spoken words, written to be read or closely paraphrased aloud — not a summary of what to say. "visual_notes" (optional) is a short, concrete filming/b-roll suggestion for that section (e.g. "cut to a close-up of your hands doing X"), only included where it adds real value.

Respond with ONLY valid JSON (no markdown fences, no commentary), matching this shape exactly:

{
  "scripts": [
    {
      "title": string,
      "angle": string,
      "sections": [ { "label": string, "script": string, "visual_notes"?: string } ],
      "cta": string,
      "estimated_duration_sec": number
    }
  ]
}

"title" is a short internal label for this script variant (not spoken on camera). "angle" is one sentence describing the approach (e.g. "Personal story that ends in the lesson"). "cta" is the exact spoken call-to-action line for the final section. "estimated_duration_sec" is your honest estimate of spoken length at a natural pace (60-120), based on the actual word count you wrote — don't just default to a round number.

Return exactly 3 scripts. Do not invent specific facts, statistics, or claims that could be false.

${ANTI_CLICHE_GUARDRAIL}`;

export async function generateProfessionalScripts(topic: string, persona?: PersonaName): Promise<ProfessionalScriptCandidate[]> {
  // 3 full multi-section scripts run noticeably longer than the other modes' output.
  const parsed = await callClaude<{ scripts: ProfessionalScriptCandidate[] }>(SCRIPT_SYSTEM_PROMPT, topic, persona, 8192);
  return parsed.scripts;
}

// ---------------------------------------------------------------------------------------------
// Content plan mode — for an SMM specialist who needs a real posting calendar, not one video idea.
// ---------------------------------------------------------------------------------------------

export type ContentPlanEntryCandidate = {
  day: number;
  format: string;
  title: string;
  caption_short: string;
  hashtags: string[];
};

function contentPlanSystemPrompt(days: number): string {
  return `You are a social media manager (SMM) planning a real posting calendar for a client's account, one entry per day for ${days} consecutive days starting tomorrow (day 1).

Given a topic/niche, generate exactly ${days} entries, one per day, that together form a coherent, varied posting plan — not ${days} unrelated ideas. Mix real content formats across the plan realistically (a healthy mix, not one format repeated every day): "Reel", "Story", "Carousel", "Post", "Live". Vary the content type across the plan too (educational, behind-the-scenes, promotional, engagement/question, testimonial/social-proof, trend-based) so it reads like a real strategy, not a list of near-duplicate posts.

Respond with ONLY valid JSON (no markdown fences, no commentary), matching this shape exactly:

{
  "entries": [
    { "day": number, "format": string, "title": string, "caption_short": string, "hashtags": [string, ...] }
  ]
}

"day" is 1 through ${days}, in order, no gaps or repeats. "format" is exactly one of: "Reel", "Story", "Carousel", "Post", "Live". "title" is a short internal label for what this post is about (under 10 words). "caption_short" is a ready-to-post caption (1-3 sentences, matching the format — brief for a Story, fuller for a Carousel/Post). "hashtags" is 5-10 relevant hashtags (no "#" prefix, lowercase, no spaces).

Do not invent specific facts, statistics, or claims that could be false.

${ANTI_CLICHE_GUARDRAIL}`;
}

export async function generateContentPlan(topic: string, days: number, persona?: PersonaName): Promise<ContentPlanEntryCandidate[]> {
  // Scales with `days` — a 30-day plan is meaningfully more JSON than a 7-day one.
  const maxTokens = Math.min(8192, 1536 + days * 180);
  const parsed = await callClaude<{ entries: ContentPlanEntryCandidate[] }>(contentPlanSystemPrompt(days), topic, persona, maxTokens);
  return parsed.entries;
}

// ---------------------------------------------------------------------------------------------
// Shot list mode — for a mobile videographer ("мобилограф") who needs to know exactly what to
// physically film, not what to say.
// ---------------------------------------------------------------------------------------------

export type ShotListItemCandidate = {
  shot_number: number;
  shot_type: string;
  description: string;
  duration_estimate_sec: number;
  gear_notes?: string;
};
export type ShotListCandidate = { items: ShotListItemCandidate[]; overall_tips: string[] };

const SHOT_LIST_SYSTEM_PROMPT = `You are a mobile videographer ("мобилограф") planning exactly what to film for a short-form video, using only a smartphone (no professional camera/crew assumed).

Given a topic, produce one real shot list: an ordered sequence of individual shots that together cover a full 30-90 second video about this topic. Each shot describes a physical, filmable action or subject — not spoken words or a script. Vary real shot types (e.g. "Wide", "Close-up", "Over-the-shoulder", "POV", "Talking head", "Cutaway/B-roll", "Top-down") rather than repeating the same one throughout.

Respond with ONLY valid JSON (no markdown fences, no commentary), matching this shape exactly:

{
  "items": [
    { "shot_number": number, "shot_type": string, "description": string, "duration_estimate_sec": number, "gear_notes"?: string }
  ],
  "overall_tips": [string, ...]
}

"shot_number" starts at 1 and increases in filming/editing order. "description" is a concrete, physical instruction (what's in frame, what's happening) a person could act on immediately with just a phone. "duration_estimate_sec" is a realistic estimate for that shot's length in the final edit. "gear_notes" (optional) is a short, genuinely useful phone-filming tip specific to that shot (e.g. natural light direction, phone angle, a $10-30 accessory like a clip-on lens or small tripod) — only include it where it adds real value, not on every shot. "overall_tips" is 3-5 general phone-filming tips for this specific topic/video (lighting, stabilization, audio) — real, actionable, not generic filmmaking platitudes.

Produce 5-10 shots total, enough to cover a real 30-90 second video.

${ANTI_CLICHE_GUARDRAIL}`;

export async function generateShotList(topic: string, persona?: PersonaName): Promise<ShotListCandidate> {
  return callClaude<ShotListCandidate>(SHOT_LIST_SYSTEM_PROMPT, topic, persona);
}

// ---------------------------------------------------------------------------------------------
// Targeting brief mode — for a paid-ads specialist ("таргетолог") who needs audience segments and
// ad copy, not organic video ideas.
// ---------------------------------------------------------------------------------------------

export type AudienceSegmentCandidate = { name: string; age_range: string; interests: string[]; rationale: string };
export type AdCopyVariantCandidate = { headline: string; primary_text: string; cta: string };
export type TargetingBriefCandidate = { audience_segments: AudienceSegmentCandidate[]; ad_copy_variants: AdCopyVariantCandidate[] };

const TARGETING_SYSTEM_PROMPT = `You are a paid social ads specialist ("таргетолог") building a targeting brief for a Meta/TikTok Ads campaign promoting content about a given topic.

Given a topic/niche, produce exactly 3 distinct real audience segments to target and exactly 3 ad copy variants to test against them.

Respond with ONLY valid JSON (no markdown fences, no commentary), matching this shape exactly:

{
  "audience_segments": [
    { "name": string, "age_range": string, "interests": [string, ...], "rationale": string }
  ],
  "ad_copy_variants": [
    { "headline": string, "primary_text": string, "cta": string }
  ]
}

Each audience segment: "name" is a short label (e.g. "New parents researching sleep training"). "age_range" is a realistic bracket (e.g. "25-34"). "interests" is 4-8 real, specific interest/behavior targeting terms an ad platform would actually let you target (not vague categories). "rationale" is one sentence on why this segment fits this specific topic.

Each ad copy variant: "headline" is under 8 words. "primary_text" is 1-3 sentences of real ad body copy. "cta" MUST be exactly one of these real Meta/TikTok Ads button labels: "Learn More", "Shop Now", "Sign Up", "Send Message", "Get Quote", "Contact Us", "Download", "Book Now", "Subscribe" — pick whichever fits the topic best, not the same one for all 3, and never a label outside this list.

Do not invent specific facts, statistics, or claims that could be false.

${ANTI_CLICHE_GUARDRAIL}`;

export async function generateTargetingBrief(topic: string, persona?: PersonaName): Promise<TargetingBriefCandidate> {
  return callClaude<TargetingBriefCandidate>(TARGETING_SYSTEM_PROMPT, topic, persona);
}

// ---------------------------------------------------------------------------------------------
// Shared Claude-call plumbing — every mode above follows the exact same
// system-prompt(+persona) -> JSON-response shape, so the actual API call/parse/error-handling
// lives in one place.
// ---------------------------------------------------------------------------------------------

async function callClaude<T>(systemPrompt: string, topic: string, persona?: PersonaName, maxTokens = 4096): Promise<T> {
  const system = persona
    ? `${systemPrompt}\n\nVoice for any written/spoken copy: ${getPersonaVoiceGuidance(persona)}`
    : systemPrompt;

  const message = await getAnthropicClient().messages.create({
    model: 'claude-sonnet-5',
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: `Topic: ${topic}` }],
  });

  const textBlock = message.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('Claude response contained no text block');
  }

  const jsonText = textBlock.text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();

  try {
    return JSON.parse(jsonText) as T;
  } catch {
    throw new Error(`Failed to parse Claude JSON response: ${jsonText.slice(0, 500)}`);
  }
}
