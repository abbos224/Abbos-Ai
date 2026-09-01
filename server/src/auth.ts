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
  const result = await getPool().query<{ id: string; email: string; password_hash: string }>(
    'SELECT id, email, password_hash FROM users WHERE email = $1',
    [email.toLowerCase()],
  );
  const row = result.rows[0];
  if (!row) throw new AuthError('Incorrect email or password.');

  const matches = await bcrypt.compare(password, row.password_hash);
  if (!matches) throw new AuthError('Incorrect email or password.');

  return { id: row.id, email: row.email };
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

export async function getUserById(id: string): Promise<AuthUser | null> {
  const result = await getPool().query<{ id: string; email: string }>(
    'SELECT id, email FROM users WHERE id = $1',
    [id],
  );
  return result.rows[0] ?? null;
}
