import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { getPool } from './db.js';
import { env } from './env.js';

export type AuthUser = { id: string; email: string };

const TOKEN_TTL = '30d'; // long-lived — a single-device solo app doesn't need refresh-token
// rotation yet; that's real future work once there's more than one client to worry about.

export class AuthError extends Error {}

export async function registerUser(email: string, password: string): Promise<AuthUser> {
  const passwordHash = await bcrypt.hash(password, 10);
  try {
    const result = await getPool().query<{ id: string; email: string }>(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email',
      [email.toLowerCase(), passwordHash],
    );
    return result.rows[0];
  } catch (err) {
    // Postgres unique_violation
    if (err instanceof Error && 'code' in err && (err as { code?: string }).code === '23505') {
      throw new AuthError('An account with that email already exists.');
    }
    throw err;
  }
}

export async function loginUser(email: string, password: string): Promise<AuthUser> {
  const result = await getPool().query<{ id: string; email: string; password_hash: string | null }>(
    'SELECT id, email, password_hash FROM users WHERE email = $1',
    [email.toLowerCase()],
  );
  const row = result.rows[0];
  // A null password_hash means a Google-only account (see findOrCreateGoogleUser) — treated the
  // same as a wrong password, not a crash or a hint that the email exists via another method.
  if (!row || !row.password_hash) throw new AuthError('Incorrect email or password.');

  const matches = await bcrypt.compare(password, row.password_hash);
  if (!matches) throw new AuthError('Incorrect email or password.');

  return { id: row.id, email: row.email };
}

/**
 * Finds the local account for a verified Google identity, or creates one. Looked up by
 * `google_id` first (fast path for a returning Google user); if that misses, falls back to
 * `email` — a password-based account with the same email gets `google_id` backfilled onto it
 * (both sign-in methods now reach the same account) rather than erroring or creating a duplicate.
 * Only reachable from the Google OAuth callback, which already verified this email via Google's
 * own token endpoint — never call this with an unverified email.
 */
export async function findOrCreateGoogleUser(googleId: string, email: string): Promise<AuthUser> {
  const normalizedEmail = email.toLowerCase();
  const pool = getPool();

  const byGoogleId = await pool.query<{ id: string; email: string }>(
    'SELECT id, email FROM users WHERE google_id = $1',
    [googleId],
  );
  if (byGoogleId.rows[0]) return byGoogleId.rows[0];

  const byEmail = await pool.query<{ id: string; email: string }>(
    'UPDATE users SET google_id = $1 WHERE email = $2 RETURNING id, email',
    [googleId, normalizedEmail],
  );
  if (byEmail.rows[0]) return byEmail.rows[0];

  const inserted = await pool.query<{ id: string; email: string }>(
    'INSERT INTO users (email, google_id) VALUES ($1, $2) RETURNING id, email',
    [normalizedEmail, googleId],
  );
  return inserted.rows[0];
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
  const result = await getPool().query<{ id: string; email: string }>(
    'SELECT id, email FROM users WHERE id = $1',
    [id],
  );
  return result.rows[0] ?? null;
}
