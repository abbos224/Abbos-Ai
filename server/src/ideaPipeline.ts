import { v4 as uuid } from 'uuid';
import { getActivePersona } from './personas.js';
import {
  generateIdeas,
  generateProfessionalScripts,
  generateContentPlan,
  generateShotList,
  generateTargetingBrief,
} from './ideaGenerator.js';
import {
  updateIdeaJob,
  type Idea,
  type ProfessionalScript,
  type ContentPlanEntry,
  type ShotList,
  type IdeaJobMode,
} from './ideaStore.js';

/** `days` only matters for 'contentPlan' mode; ignored otherwise (see index.ts's route, which
 * only forwards it when mode is 'contentPlan'). */
export async function processIdeaJob(userId: string, ideaJobId: string, topic: string, mode: IdeaJobMode, days?: number): Promise<void> {
  try {
    const persona = await getActivePersona(userId);

    switch (mode) {
      case 'topics': {
        const candidates = await generateIdeas(topic, persona);
        const ideas: Idea[] = candidates.map((c) => ({
          id: uuid(),
          hook: c.hook,
          script: c.script,
          cta: c.cta,
          socialCaption: c.social_caption,
        }));
        await updateIdeaJob(userId, ideaJobId, { status: 'done', ideas });
        break;
      }
      case 'script': {
        const candidates = await generateProfessionalScripts(topic, persona);
        const scripts: ProfessionalScript[] = candidates.map((c) => ({
          id: uuid(),
          title: c.title,
          angle: c.angle,
          sections: c.sections.map((s) => ({ label: s.label, script: s.script, visualNotes: s.visual_notes })),
          cta: c.cta,
          estimatedDurationSec: c.estimated_duration_sec,
        }));
        await updateIdeaJob(userId, ideaJobId, { status: 'done', scripts });
        break;
      }
      case 'contentPlan': {
        const candidates = await generateContentPlan(topic, days ?? 7, persona);
        const contentPlan: ContentPlanEntry[] = candidates.map((c) => ({
          id: uuid(),
          day: c.day,
          format: c.format,
          title: c.title,
          captionShort: c.caption_short,
          hashtags: c.hashtags,
        }));
        await updateIdeaJob(userId, ideaJobId, { status: 'done', contentPlan });
        break;
      }
      case 'shotList': {
        const candidate = await generateShotList(topic, persona);
        const shotList: ShotList = {
          items: candidate.items.map((i) => ({
            id: uuid(),
            shotNumber: i.shot_number,
            shotType: i.shot_type,
            description: i.description,
            durationEstimateSec: i.duration_estimate_sec,
            gearNotes: i.gear_notes,
          })),
          overallTips: candidate.overall_tips,
        };
        await updateIdeaJob(userId, ideaJobId, { status: 'done', shotList });
        break;
      }
      case 'targeting': {
        const candidate = await generateTargetingBrief(topic, persona);
        await updateIdeaJob(userId, ideaJobId, {
          status: 'done',
          targeting: {
            audienceSegments: candidate.audience_segments.map((s) => ({
              id: uuid(),
              name: s.name,
              ageRange: s.age_range,
              interests: s.interests,
              rationale: s.rationale,
            })),
            adCopyVariants: candidate.ad_copy_variants.map((v) => ({
              id: uuid(),
              headline: v.headline,
              primaryText: v.primary_text,
              cta: v.cta,
            })),
          },
        });
        break;
      }
    }
  } catch (err) {
    await updateIdeaJob(userId, ideaJobId, {
      status: 'failed',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
