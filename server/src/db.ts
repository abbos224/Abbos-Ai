import pg from 'pg';
import { env } from './env.js';

const { Pool } = pg;

let pool: pg.Pool | undefined;

export function getPool(): pg.Pool {
  if (!env.databaseUrl) {
    throw new Error('DATABASE_URL is not set. Add it to server/.env');
  }
  if (!pool) pool = new Pool({ connectionString: env.databaseUrl });
  return pool;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Every jobs/idea_jobs/image_jobs `id` column is `UUID` — a syntactically invalid id (e.g. from
 * a garbage :id route param) makes Postgres throw `invalid input syntax for type uuid` rather
 * than just finding no row. store.ts/ideaStore.ts/imageStore.ts's getX(userId, id) functions use
 * this to treat that the same as "not found" — cheaper too, since it skips a doomed query. */
export function isValidUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

/** Creates the tables this app needs if they don't already exist. Called once at server startup
 * — a stand-in for a real migration tool, fine while there's a single table and no schema
 * changes to track yet. */
export async function runMigrations(): Promise<void> {
  const pool = getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  // A Google-only account has no password. Both statements are idempotent (safe to re-run on
  // every startup like everything else here) — DROP NOT NULL on an already-nullable column, and
  // ADD COLUMN IF NOT EXISTS on an already-present one, are both no-ops.
  await pool.query(`ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id TEXT UNIQUE;`);
  // Jobs/clips are stored as one JSONB blob per job (see store.ts) rather than fully normalized
  // tables — keeps the existing Job/Clip shape and every caller untouched; id/user_id/created_at
  // are promoted to real columns purely for the PK, ownership filter, and list ordering.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS jobs (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      data JSONB NOT NULL
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS jobs_user_id_idx ON jobs (user_id);`);

  // Brand Kit is a small, fixed set of fields (unlike jobs' variable nested shape) — a real
  // one-row-per-user table fits better here than a JSONB blob.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS brand_kits (
      user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      logo_file TEXT,
      accent_color TEXT,
      caption_style TEXT,
      sound_effects_style TEXT
    );
  `);

  // The 5 persona presets themselves stay hardcoded in personas.ts (not user data) — only which
  // one is active per account is persisted here.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS persona_settings (
      user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      active_persona TEXT
    );
  `);

  // refresh_token is a live third-party credential stored in plaintext — acceptable for this
  // single-developer local Postgres instance, but real encryption-at-rest (pgcrypto or an
  // app-level key) is a documented gap before this ever runs anywhere multi-tenant.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS youtube_auth (
      user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      refresh_token TEXT NOT NULL,
      channel_title TEXT
    );
  `);

  // Idea generations (topic -> AI-generated hooks/scripts, no source video) get their own table
  // rather than reusing jobs — Job/Clip are deeply video-pipeline-specific (sourceFile,
  // startTime/endTime, a rendering-focused JobStatus) with no sensible value for a text-only
  // result. Same JSONB-per-row shape as jobs, though, for the same reasons (see ideaStore.ts).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS idea_jobs (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      data JSONB NOT NULL
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idea_jobs_user_id_idx ON idea_jobs (user_id);`);

  // AI image generation/editing (a text prompt, optionally with a source photo to edit) — same
  // JSONB-per-row shape as idea_jobs, for the same reasons (see imageStore.ts).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS image_jobs (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      data JSONB NOT NULL
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS image_jobs_user_id_idx ON image_jobs (user_id);`);
}
