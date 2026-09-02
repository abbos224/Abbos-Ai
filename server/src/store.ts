import { getPool } from './db.js';

export type ClipScore = {
  hook: number;
  retention: number;
  emotion: number;
  clarity: number;
  shareability: number;
  cta: number;
};

export type ClipStatus = 'pending' | 'rendering' | 'done' | 'failed';

export type Translation = {
  id: string;
  language: string; // BCP-47-ish code, e.g. 'ru', 'ar', 'es'
  languageLabel: string; // human-readable, e.g. 'Russian'
  hook: string;
  status: 'rendering' | 'done' | 'failed';
  outputFile?: string;
  error?: string;
};

export type SocialCaption = {
  short: string;
  medium: string;
  long: string;
  hashtags: string[];
  keywords: string[];
};

export type RegenerateModifier = 'moreViral' | 'moreProfessional' | 'moreEmotional' | 'moreLuxury';

export type Regeneration = {
  id: string;
  modifier: RegenerateModifier;
  modifierLabel: string; // human-readable, e.g. 'More Viral'
  hookOptions: string[];
  chosenHook: string;
  cta: string;
  coverOptions: string[];
  coverImages?: string[];
  socialCaption?: SocialCaption;
  status: 'rendering' | 'done' | 'failed';
  outputFile?: string;
  error?: string;
};

export type Clip = {
  id: string;
  jobId: string;
  startTime: number;
  endTime: number;
  topic: string;
  score: number;
  scoreBreakdown: ClipScore;
  scoreRationale?: string; // one-sentence "why this score" — strongest + weakest dimension
  hookOptions: string[];
  chosenHook: string;
  cta: string;
  coverOptions: string[];
  coverImages?: string[]; // rendered cover image URLs, same order as coverOptions
  socialCaption?: SocialCaption; // post caption/hashtags/keywords for manual posting to IG/TikTok
  status: ClipStatus;
  outputFile?: string;
  error?: string;
  translations?: Translation[];
  regenerations?: Regeneration[];
  scheduledFor?: string; // ISO date (yyyy-mm-dd), when the user plans to post this clip
  publishedYoutubeUrl?: string; // set once this clip has been uploaded to YouTube
};

export type JobStatus =
  | 'uploaded'
  | 'transcribing'
  | 'analyzing'
  | 'rendering'
  | 'done'
  | 'failed';

export type Job = {
  id: string;
  originalFilename: string;
  sourceFile: string;
  durationSec?: number;
  width?: number;
  height?: number;
  status: JobStatus;
  error?: string;
  createdAt: string;
  clips: Clip[];
};

// Jobs live in Postgres, one row per job, scoped by user_id — see db.ts's runMigrations for the
// table. Every function here takes userId and filters by it, so a wrong/other-user job id
// resolves to "not found" rather than a permissions error (avoids confirming another account's
// job id exists).

export async function createJob(userId: string, job: Job): Promise<void> {
  await getPool().query('INSERT INTO jobs (id, user_id, created_at, data) VALUES ($1, $2, $3, $4)', [
    job.id,
    userId,
    job.createdAt,
    JSON.stringify(job),
  ]);
}

export async function getJob(userId: string, id: string): Promise<Job | undefined> {
  const result = await getPool().query<{ data: Job }>('SELECT data FROM jobs WHERE id = $1 AND user_id = $2', [
    id,
    userId,
  ]);
  return result.rows[0]?.data;
}

export async function listAllJobs(userId: string): Promise<Job[]> {
  const result = await getPool().query<{ data: Job }>(
    'SELECT data FROM jobs WHERE user_id = $1 ORDER BY created_at DESC',
    [userId],
  );
  return result.rows.map((row) => row.data);
}

// Clips within the same job can now be rendered concurrently (see pipeline.ts), so multiple
// updateClip calls for the *same* job row can genuinely overlap in time. A plain read-then-write
// would race: two concurrent calls could both read the row before either writes, and the second
// write would silently drop the first clip's update. withJobTransaction takes a real row lock
// (`SELECT ... FOR UPDATE` inside a transaction) so concurrent writers to the same job serialize
// at the database level, while writers to *different* jobs (different clips' jobs, or different
// users) are untouched by the lock and proceed fully in parallel.
async function withJobTransaction(
  userId: string,
  jobId: string,
  apply: (job: Job) => Job,
): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await client.query<{ data: Job }>(
      'SELECT data FROM jobs WHERE id = $1 AND user_id = $2 FOR UPDATE',
      [jobId, userId],
    );
    const job = result.rows[0]?.data;
    if (!job) throw new Error(`Job not found: ${jobId}`);
    const updated = apply(job);
    await client.query('UPDATE jobs SET data = $1 WHERE id = $2 AND user_id = $3', [
      JSON.stringify(updated),
      jobId,
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

export async function updateJob(userId: string, id: string, patch: Partial<Job>): Promise<void> {
  await withJobTransaction(userId, id, (job) => ({ ...job, ...patch }));
}

export async function setClips(userId: string, jobId: string, clips: Clip[]): Promise<void> {
  await updateJob(userId, jobId, { clips });
}

export async function updateClip(
  userId: string,
  jobId: string,
  clipId: string,
  patch: Partial<Clip>,
): Promise<void> {
  await withJobTransaction(userId, jobId, (job) => ({
    ...job,
    clips: job.clips.map((c) => (c.id === clipId ? { ...c, ...patch } : c)),
  }));
}
