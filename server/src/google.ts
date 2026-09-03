import { env } from './env.js';

// Basic, non-sensitive scopes — no extra Google app-verification needed even with the OAuth
// consent screen still in Testing status (same as the YouTube client).
const SCOPE = 'openid email profile';

export function isConfigured(): boolean {
  return Boolean(env.googleClientId && env.googleClientSecret && env.googleRedirectUri);
}

/** Builds the URL the user visits in a browser to sign in with Google. `state` is opaque to
 * Google — it's echoed back verbatim to /oauth/google/callback (see auth.ts's
 * signGoogleState/verifyGoogleState for what it carries and why). */
export function getAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: env.googleClientId,
    redirect_uri: env.googleRedirectUri,
    response_type: 'code',
    scope: SCOPE,
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export type GoogleIdentity = { googleId: string; email: string };

/**
 * Exchanges the OAuth redirect's `code` for Google's `id_token` and pulls the verified identity
 * out of it. Decoded without a cryptographic signature check — acceptable here because this
 * `id_token` is never handed to us by the client; it comes back on a direct server-to-server
 * HTTPS call to Google's own token endpoint, authenticated with our client secret. A client that
 * sent us an id_token directly (skipping this exchange) would need real JWKS signature
 * verification instead; that's not the shape of this flow.
 */
export async function completeAuth(code: string): Promise<GoogleIdentity> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.googleClientId,
      client_secret: env.googleClientSecret,
      redirect_uri: env.googleRedirectUri,
      grant_type: 'authorization_code',
      code,
    }),
  });

  if (!res.ok) {
    throw new Error(`Google token exchange failed: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as { id_token?: string };
  if (!data.id_token) {
    throw new Error('Google did not return an id_token.');
  }

  const payloadSegment = data.id_token.split('.')[1];
  const payload = JSON.parse(Buffer.from(payloadSegment, 'base64url').toString('utf-8')) as {
    sub: string;
    email?: string;
    email_verified?: boolean;
  };

  if (!payload.email || payload.email_verified === false) {
    throw new Error('Google account has no verified email.');
  }

  return { googleId: payload.sub, email: payload.email };
}
