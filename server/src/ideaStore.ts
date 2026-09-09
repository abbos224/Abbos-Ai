import { getPool, isValidUuid } from './db.js';
import type { SocialCaption } from './store.js';

export type Idea = {
  id: string;
  hook: string;
  script: string; // a short spoken script/outline the user can record from
  cta: string;
  socialCaption?: SocialCaption; // reuses the same hashtags/keywords shape as rendered clips
};

export type ScriptSection = { label: string; script: string; visualNotes?: string };
export type ProfessionalScript = {
  id: string;
  title: string;
  angle: string;
  sections: ScriptSection[];
  cta: string;
  estimatedDurationSec: number;
};

export type ContentPlanEntry = {
  id: string;
  day: number;
  format: string;
  title: string;
  captionShort: string;
  hashtags: string[];
};

export type ShotListItem = {
  id: string;
  shotNumber: number;
  shotType: string;
  description: string;
  durationEstimateSec: number;
  gearNotes?: string;
};
export type ShotList = { items: ShotListItem[]; overallTips: string[] };

export type AudienceSegment = { id: string; name: string; ageRange: string; interests: string[]; rationale: string };
export type AdCopyVariant = { id: string; headline: string; primaryText: string; cta: string };
export type TargetingBrief = { audienceSegments: AudienceSegment[]; adCopyVariants: AdCopyVariant[] };

// One generator, five interchangeable output shapes — a real, switchable mode per the "generate
// for an SMM specialist / mobile videographer / targeting specialist" request, not five separate
// features. 'topics' is the original mode (kept as the default so old jobs/UI keep working).
export type IdeaJobMode = 'topics' | 'script' | 'contentPlan' | 'shotList' | 'targeting';

export type IdeaJobStatus = 'generating' | 'done' | 'failed';

export type IdeaJob = {
  id: string;
  topic: string;
  mode: IdeaJobMode;
  status: IdeaJobStatus;
  error?: string;
  createdAt: string;
  // Exactly one of these is populated, matching `mode` — the rest stay at their empty default.
  // Kept as separate typed fields (not one `result: unknown`) so both server and mobile get real
  // type-checking on whichever shape a given mode actually produces.
  ideas: Idea[];
  scripts: ProfessionalScript[];
  contentPlan: ContentPlanEntry[];
  shotList: ShotList | null;
  targeting: TargetingBrief | null;
};

/** How many real generated items a job produced, regardless of mode — used for the summary list's
 * "N ideas"/"N scripts"/etc. count without the caller needing to know each mode's own shape. */
export function ideaJobItemCount(job: IdeaJob): number {
  switch (job.mode) {
    case 'topics':
      return job.ideas.length;
    case 'script':
      return job.scripts.length;
    case 'contentPlan':
      return job.contentPlan.length;
    case 'shotList':
      return job.shotList?.items.length ?? 0;
    case 'targeting':
      return job.targeting ? job.targeting.audienceSegments.length + job.targeting.adCopyVariants.length : 0;
  }
}

// Same JSONB-per-row shape and row-lock pattern as store.ts's jobs table — see db.ts's
// runMigrations for the idea_jobs table.

/** Rows created before `mode` and the per-mode result fields existed are missing them entirely
 * (JSONB just doesn't have the key, not `null`) — real old data, not a bug. Every read path
 * normalizes through here so callers (and the mobile client) never have to special-case a job
 * with `mode: undefined`; it's treated as 'topics', matching what it actually was before modes
 * existed. */
function normalizeIdeaJob(job: IdeaJob): IdeaJob {
  return {
    ...job,
    mode: job.mode ?? 'topics',
    ideas: job.ideas ?? [],
    scripts: job.scripts ?? [],
    contentPlan: job.contentPlan ?? [],
    shotList: job.shotList ?? null,
    targeting: job.targeting ?? null,
  };
}

export async function createIdeaJob(userId: string, ideaJob: IdeaJob): Promise<void> {
  await getPool().query('INSERT INTO idea_jobs (id, user_id, created_at, data) VALUES ($1, $2, $3, $4)', [
    ideaJob.id,
    userId,
    ideaJob.createdAt,
    JSON.stringify(ideaJob),
  ]);
}

export async function getIdeaJob(userId: string, id: string): Promise<IdeaJob | undefined> {
  if (!isValidUuid(id)) return undefined;
  const result = await getPool().query<{ data: IdeaJob }>(
    'SELECT data FROM idea_jobs WHERE id = $1 AND user_id = $2',
    [id, userId],
  );
  const data = result.rows[0]?.data;
  return data && normalizeIdeaJob(data);
}

export async function listIdeaJobs(userId: string): Promise<IdeaJob[]> {
  const result = await getPool().query<{ data: IdeaJob }>(
    'SELECT data FROM idea_jobs WHERE user_id = $1 ORDER BY created_at DESC',
    [userId],
  );
  return result.rows.map((row) => normalizeIdeaJob(row.data));
}

export async function updateIdeaJob(userId: string, id: string, patch: Partial<IdeaJob>): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await client.query<{ data: IdeaJob }>(
      'SELECT data FROM idea_jobs WHERE id = $1 AND user_id = $2 FOR UPDATE',
      [id, userId],
    );
    const ideaJob = result.rows[0]?.data;
    if (!ideaJob) throw new Error(`Idea job not found: ${id}`);
    const updated = { ...normalizeIdeaJob(ideaJob), ...patch };
    await client.query('UPDATE idea_jobs SET data = $1 WHERE id = $2 AND user_id = $3', [
      JSON.stringify(updated),
      id,
      userId,
    ]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
