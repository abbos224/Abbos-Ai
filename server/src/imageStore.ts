import { getPool } from './db.js';

export type ImageJobStatus = 'generating' | 'done' | 'failed';

export type ImageJob = {
  id: string;
  prompt: string;
  mode: 'generate' | 'edit'; // 'edit' when a source image (fresh upload or a chained past job) was used
  status: ImageJobStatus;
  error?: string;
  createdAt: string;
  outputFile?: string; // e.g. /generated-images/<id>/output.png — set when status === 'done'
  outputMimeType?: string; // set alongside outputFile; reused as-is if this job is later chained into another edit
};

// Same JSONB-per-row shape and row-lock pattern as ideaStore.ts — see db.ts's runMigrations for
// the image_jobs table.

export async function createImageJob(userId: string, job: ImageJob): Promise<void> {
  await getPool().query('INSERT INTO image_jobs (id, user_id, created_at, data) VALUES ($1, $2, $3, $4)', [
    job.id,
    userId,
    job.createdAt,
    JSON.stringify(job),
  ]);
}

export async function getImageJob(userId: string, id: string): Promise<ImageJob | undefined> {
  const result = await getPool().query<{ data: ImageJob }>(
    'SELECT data FROM image_jobs WHERE id = $1 AND user_id = $2',
    [id, userId],
  );
  return result.rows[0]?.data;
}

export async function listImageJobs(userId: string): Promise<ImageJob[]> {
  const result = await getPool().query<{ data: ImageJob }>(
    'SELECT data FROM image_jobs WHERE user_id = $1 ORDER BY created_at DESC',
    [userId],
  );
  return result.rows.map((row) => row.data);
}

// Backs the free-tier generation limit (see FREE_IMAGE_GENERATION_LIMIT in index.ts) — every
// created row is one real, paid Gemini API call regardless of whether it later succeeds or
// fails, so total row count (not just 'done' ones) is what should count against the limit.
export async function countImageJobs(userId: string): Promise<number> {
  const result = await getPool().query<{ count: string }>(
    'SELECT COUNT(*) FROM image_jobs WHERE user_id = $1',
    [userId],
  );
  return Number(result.rows[0]?.count ?? 0);
}

export async function updateImageJob(userId: string, id: string, patch: Partial<ImageJob>): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await client.query<{ data: ImageJob }>(
      'SELECT data FROM image_jobs WHERE id = $1 AND user_id = $2 FOR UPDATE',
      [id, userId],
    );
    const job = result.rows[0]?.data;
    if (!job) throw new Error(`Image job not found: ${id}`);
    const updated = { ...job, ...patch };
    await client.query('UPDATE image_jobs SET data = $1 WHERE id = $2 AND user_id = $3', [
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
