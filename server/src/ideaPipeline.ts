import { v4 as uuid } from 'uuid';
import { getActivePersona } from './personas.js';
import { generateIdeas } from './ideaGenerator.js';
import { updateIdeaJob, type Idea } from './ideaStore.js';

export async function processIdeaJob(userId: string, ideaJobId: string, topic: string): Promise<void> {
  try {
    const persona = await getActivePersona(userId);
    const candidates = await generateIdeas(topic, persona);

    const ideas: Idea[] = candidates.map((c) => ({
      id: uuid(),
      hook: c.hook,
      script: c.script,
      cta: c.cta,
      socialCaption: c.social_caption,
    }));

    await updateIdeaJob(userId, ideaJobId, { status: 'done', ideas });
  } catch (err) {
    await updateIdeaJob(userId, ideaJobId, {
      status: 'failed',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
