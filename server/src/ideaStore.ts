import { getPool } from './db.js';
import type { SocialCaption } from './store.js';

export type Idea = {
  id: string;
  hook: string;
  script: string; // a short spoken script/outline the user can record from
  cta: string;
  socialCaption?: SocialCaption; // reuses the same hashtags/keywords shape as rendered clips
};

export type IdeaJobStatus = 'generating' | 'done' | 'failed';

export type IdeaJob = {
  id: string;
  topic: string;
  status: IdeaJobStatus;
  error?: string;
  createdAt: string;
  ideas: Idea[];
};

// Same JSONB-per-row shape and row-lock pattern as store.ts's jobs table — see db.ts's
// runMigrations for the idea_jobs table.

export async function createIdeaJob(userId: string, ideaJob: IdeaJob): Promise<void> {
  await getPool().query('INSERT INTO idea_jobs (id, user_id, created_at, data) VALUES ($1, $2, $3, $4)', [
    ideaJob.id,
    userId,
    ideaJob.createdAt,
    JSON.stringify(ideaJob),
  ]);
}

export async function getIdeaJob(userId: string, id: string): Promise<IdeaJob | undefined> {
  const result = await getPool().query<{ data: IdeaJob }>(
    'SELECT data FROM idea_jobs WHERE id = $1 AND user_id = $2',
    [id, userId],
  );
  return result.rows[0]?.data;
}

export async function listIdeaJobs(userId: string): Promise<IdeaJob[]> {
  const result = await getPool().query<{ data: IdeaJob }>(
    'SELECT data FROM idea_jobs WHERE user_id = $1 ORDER BY created_at DESC',
    [userId],
  );
  return result.rows.map((row) => row.data);
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
    const updated = { ...ideaJob, ...patch };
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
