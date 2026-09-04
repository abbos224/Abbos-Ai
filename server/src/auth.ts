import bcrypt from 'bcrypt';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { getPool } from './db.js';
import { env } from './env.js';

export type AuthUser = { id: string; email: string; emailVerified: boolean };

const TOKEN_TTL = '30d'; // long-lived — a single-device solo app doesn't need refresh-token
// rotation yet; that's real future work once there's more than one client to worry about.

export class AuthError extends Error {}

export async function registerUser(email: string, password: string): Promise<AuthUser> {
  const passwordHash = await bcrypt.hash(password, 10);
  try {
    // Brand-new password accounts start unverified — every other account (pre-existing rows,
    // Google sign-ins) defaults to true at the column level (see db.ts) and never passes through
    // here.
    const result = await getPool().query<{ id: string; email: string; email_verified: boolean }>(
      'INSERT INTO users (email, password_hash, email_verified) VALUES ($1, $2, false) RETURNING id, email, email_verified',
      [email.toLowerCase(), passwordHash],
    );
    return toAuthUser(result.rows[0]);
  } catch (err) {
    // Postgres unique_violation
    if (err instanceof Error && 'code' in err && (err as { code?: string }).code === '23505') {
      throw new AuthError('An account with that email already exists.');
    }
    throw err;
  }
}

export async function loginUser(email: string, password: string): Promise<AuthUser> {
  const result = await getPool().query<{ id: string; email: string; password_hash: string | null; email_verified: boolean }>(
    'SELECT id, email, password_hash, email_verified FROM users WHERE email = $1',
    [email.toLowerCase()],
  );
  const row = result.rows[0];
  // A null password_hash means a Google-only account (see findOrCreateGoogleUser) — treated the
  // same as a wrong password, not a crash or a hint that the email exists via another method.
  if (!row || !row.password_hash) throw new AuthError('Incorrect email or password.');

  const matches = await bcrypt.compare(password, row.password_hash);
  if (!matches) throw new AuthError('Incorrect email or password.');

  return toAuthUser(row);
}

/**
 * Finds the local account for a verified Google identity, or creates one. Looked up by
 * `google_id` first (fast path for a returning Google user); if that misses, falls back to
 * `email` — a password-based account with the same email gets `google_id` backfilled onto it
 * (both sign-in methods now reach the same account) rather than erroring or creating a duplicate.
 * That linking path also sets `email_verified = true`: Google vouching for the same address is
 * real proof of ownership, so an account that registered but never verified clears the gate as a
 * side effect of signing in with Google. Only reachable from the Google OAuth callback, which
 * already verified this email via Google's own token endpoint — never call this with an
 * unverified email.
 */
export async function findOrCreateGoogleUser(googleId: string, email: string): Promise<AuthUser> {
  const normalizedEmail = email.toLowerCase();
  const pool = getPool();

  const byGoogleId = await pool.query<{ id: string; email: string; email_verified: boolean }>(
    'SELECT id, email, email_verified FROM users WHERE google_id = $1',
    [googleId],
  );
  if (byGoogleId.rows[0]) return toAuthUser(byGoogleId.rows[0]);

  const byEmail = await pool.query<{ id: string; email: string; email_verified: boolean }>(
    'UPDATE users SET google_id = $1, email_verified = true WHERE email = $2 RETURNING id, email, email_verified',
    [googleId, normalizedEmail],
  );
  if (byEmail.rows[0]) return toAuthUser(byEmail.rows[0]);

  const inserted = await pool.query<{ id: string; email: string; email_verified: boolean }>(
    'INSERT INTO users (email, google_id) VALUES ($1, $2) RETURNING id, email, email_verified',
    [normalizedEmail, googleId],
  );
  return toAuthUser(inserted.rows[0]);
}

export function signToken(userId: string): string {
  if (!env.jwtSecret) throw new Error('JWT_SECRET is not set. Add it to server/.env');
  return jwt.sign({ sub: userId }, env.jwtSecret, { expiresIn: TOKEN_TTL });
}

export function verifyToken(token: string): string {
  if (!env.jwtSecret) throw new Error('JWT_SECRET is not set. Add it to server/.env');
  const decoded = jwt.verify(token, env.jwtSecret) as jwt.JwtPayload;
  if (typeof decoded.sub !== 'string') throw new AuthError('Invalid token.');
  return decoded.sub;
}

// A separate, short-lived, purpose-scoped token for the YouTube OAuth handshake — deliberately
// NOT the normal 30-day session token. The "Connect YouTube" flow has to open a real browser
// (Google disallows in-app WebView OAuth), so there's no Authorization header available to
// identify the user on /oauth/youtube/start or the Google redirect back to
// /oauth/youtube/callback; this token travels in the URL/query string instead (as Google's own
// opaque `state` param), so it gets a 10-minute expiry and a `purpose` claim that keeps it from
// being usable as a session credential even if it leaked via browser history or a referrer header.
const OAUTH_STATE_TTL = '10m';
const OAUTH_STATE_PURPOSE = 'youtube-oauth';

export function signOAuthState(userId: string): string {
  if (!env.jwtSecret) throw new Error('JWT_SECRET is not set. Add it to server/.env');
  return jwt.sign({ sub: userId, purpose: OAUTH_STATE_PURPOSE }, env.jwtSecret, { expiresIn: OAUTH_STATE_TTL });
}

export function verifyOAuthState(token: string): string {
  if (!env.jwtSecret) throw new Error('JWT_SECRET is not set. Add it to server/.env');
  const decoded = jwt.verify(token, env.jwtSecret) as jwt.JwtPayload;
  if (typeof decoded.sub !== 'string' || decoded.purpose !== OAUTH_STATE_PURPOSE) {
    throw new AuthError('Invalid or expired OAuth state.');
  }
  return decoded.sub;
}

// Same shape/purpose as signOAuthState/verifyOAuthState above, but for the opposite case: Google
// *sign-in* has no userId yet when the flow starts (that's the entire point of the button), so
// there's nothing to sign as the subject. Instead the state carries `returnTo` — the mobile app's
// own exp:// deep link, computed once and passed straight through Google's opaque `state` param —
// so the callback knows where to hand the freshly-minted session token back to. Same short TTL
// and purpose-scoping rationale as the YouTube state token.
const GOOGLE_STATE_TTL = '10m';
const GOOGLE_STATE_PURPOSE = 'google-signin';

export function signGoogleState(returnTo: string): string {
  if (!env.jwtSecret) throw new Error('JWT_SECRET is not set. Add it to server/.env');
  return jwt.sign({ returnTo, purpose: GOOGLE_STATE_PURPOSE }, env.jwtSecret, { expiresIn: GOOGLE_STATE_TTL });
}

export function verifyGoogleState(token: string): string {
  if (!env.jwtSecret) throw new Error('JWT_SECRET is not set. Add it to server/.env');
  const decoded = jwt.verify(token, env.jwtSecret) as jwt.JwtPayload & { returnTo?: string };
  if (typeof decoded.returnTo !== 'string' || decoded.purpose !== GOOGLE_STATE_PURPOSE) {
    throw new AuthError('Invalid or expired sign-in request.');
  }
  return decoded.returnTo;
}

export async function getUserById(id: string): Promise<AuthUser | null> {
  const result = await getPool().query<{ id: string; email: string; email_verified: boolean }>(
    'SELECT id, email, email_verified FROM users WHERE id = $1',
    [id],
  );
  return result.rows[0] ? toAuthUser(result.rows[0]) : null;
}

function toAuthUser(row: { id: string; email: string; email_verified: boolean }): AuthUser {
  return { id: row.id, email: row.email, emailVerified: row.email_verified };
}

// --- Email verification + password reset ---
//
// Both flows email a plain 6-digit code the user types into the app, rather than a link — Expo
// Go's exp:// deep link only resolves back into *this* running dev session (it's how Google
// sign-in's own callback link works), so a link opened cold from an email client days later can't
// reach the app at all. Codes are hashed with bcrypt before storing (same cost factor as
// passwords) and capped at 15 minutes / 5 wrong guesses each — cheap, proportionate hardening for
// what would otherwise be a 1-in-a-million guess space with no per-IP throttling in front of it.

const CODE_TTL_MINUTES = 15;
const MAX_CODE_ATTEMPTS = 5;

function generateSixDigitCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

export async function createEmailVerificationCode(userId: string): Promise<string> {
  const code = generateSixDigitCode();
  const hash = await bcrypt.hash(code, 10);
  await getPool().query(
    `UPDATE users SET
       email_verify_code_hash = $1,
       email_verify_code_expires_at = now() + interval '${CODE_TTL_MINUTES} minutes',
       email_verify_attempts = 0
     WHERE id = $2`,
    [hash, userId],
  );
  return code;
}

export async function verifyEmailCode(userId: string, code: string): Promise<void> {
  const result = await getPool().query<{
    email_verify_code_hash: string | null;
    email_verify_code_expires_at: string | null;
    email_verify_attempts: number;
  }>(
    'SELECT email_verify_code_hash, email_verify_code_expires_at, email_verify_attempts FROM users WHERE id = $1',
    [userId],
  );
  const row = result.rows[0];
  if (
    !row?.email_verify_code_hash ||
    !row.email_verify_code_expires_at ||
    new Date(row.email_verify_code_expires_at) < new Date() ||
    row.email_verify_attempts >= MAX_CODE_ATTEMPTS
  ) {
    throw new AuthError('That code is invalid or expired. Request a new one.');
  }

  const matches = await bcrypt.compare(code, row.email_verify_code_hash);
  if (!matches) {
    await getPool().query('UPDATE users SET email_verify_attempts = email_verify_attempts + 1 WHERE id = $1', [userId]);
    throw new AuthError('Incorrect code.');
  }

  await getPool().query(
    `UPDATE users SET
       email_verified = true,
       email_verify_code_hash = NULL,
       email_verify_code_expires_at = NULL,
       email_verify_attempts = 0
     WHERE id = $1`,
    [userId],
  );
}

// Returns null (silently) when the email doesn't match any account — the route always sends the
// same generic "if that email exists, we sent a code" response either way, so a caller can't use
// this to enumerate registered accounts.
export async function createPasswordResetCode(email: string): Promise<{ userId: string; code: string } | null> {
  const result = await getPool().query<{ id: string }>('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
  const userId = result.rows[0]?.id;
  if (!userId) return null;

  const code = generateSixDigitCode();
  const hash = await bcrypt.hash(code, 10);
  await getPool().query(
    `UPDATE users SET
       password_reset_code_hash = $1,
       password_reset_code_expires_at = now() + interval '${CODE_TTL_MINUTES} minutes',
       password_reset_attempts = 0
     WHERE id = $2`,
    [hash, userId],
  );
  return { userId, code };
}

/**
 * Verifies the reset code and sets a new password — works for a Google-only account too (no
 * password_hash yet), which just means a valid code here adds a password as a backup sign-in
 * method rather than "resetting" one that existed. Also marks the email verified: successfully
 * receiving and entering a code that arrived at that inbox is real proof of ownership, so an
 * account that registered but never verified is cleared as a side effect of resetting its
 * password too.
 */
export async function resetPasswordWithCode(email: string, code: string, newPassword: string): Promise<AuthUser> {
  const result = await getPool().query<{
    id: string;
    email: string;
    email_verified: boolean;
    password_reset_code_hash: string | null;
    password_reset_code_expires_at: string | null;
    password_reset_attempts: number;
  }>(
    'SELECT id, email, email_verified, password_reset_code_hash, password_reset_code_expires_at, password_reset_attempts FROM users WHERE email = $1',
    [email.toLowerCase()],
  );
  const row = result.rows[0];
  // Same generic message whether the account doesn't exist, the code is wrong, or it's expired —
  // avoids leaking which case it was.
  const genericError = () => new AuthError('That code is invalid or expired. Request a new one.');
  if (
    !row?.password_reset_code_hash ||
    !row.password_reset_code_expires_at ||
    new Date(row.password_reset_code_expires_at) < new Date() ||
    row.password_reset_attempts >= MAX_CODE_ATTEMPTS
  ) {
    throw genericError();
  }

  const matches = await bcrypt.compare(code, row.password_reset_code_hash);
  if (!matches) {
    await getPool().query('UPDATE users SET password_reset_attempts = password_reset_attempts + 1 WHERE id = $1', [row.id]);
    throw genericError();
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await getPool().query(
    `UPDATE users SET
       password_hash = $1,
       email_verified = true,
       password_reset_code_hash = NULL,
       password_reset_code_expires_at = NULL,
       password_reset_attempts = 0
     WHERE id = $2`,
    [passwordHash, row.id],
  );
  return { id: row.id, email: row.email, emailVerified: true };
}
