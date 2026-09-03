import { getPool, isValidUuid } from './db.js';

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

// Checks the free-tier limit and creates the job atomically, so two concurrent requests from the
// same account can't both read "9 used" and both slip in an 11th real, paid Gemini call. A plain
// count-then-insert (what this replaced) has exactly that TOCTOU race — COUNT(*) can't itself be
// locked with FOR UPDATE, so this serializes concurrent attempts by the same user via a
// transaction-scoped Postgres advisory lock (released automatically on commit/rollback) around
// the count-then-insert instead.
export async function createImageJobIfUnderLimit(
  userId: string,
  job: ImageJob,
  limit: number,
): Promise<{ created: boolean; used: number }> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [userId]);
    const countResult = await client.query<{ count: string }>(
      'SELECT COUNT(*) FROM image_jobs WHERE user_id = $1',
      [userId],
    );
    const used = Number(countResult.rows[0]?.count ?? 0);
    if (used >= limit) {
      await client.query('COMMIT');
      return { created: false, used };
    }
    await client.query('INSERT INTO image_jobs (id, user_id, created_at, data) VALUES ($1, $2, $3, $4)', [
      job.id,
      userId,
      job.createdAt,
      JSON.stringify(job),
    ]);
    await client.query('COMMIT');
    return { created: true, used: used + 1 };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function getImageJob(userId: string, id: string): Promise<ImageJob | undefined> {
  if (!isValidUuid(id)) return undefined;
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
