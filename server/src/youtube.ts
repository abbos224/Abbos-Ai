import fs from 'node:fs';
import path from 'node:path';
import { env } from './env.js';

const SCOPE = 'https://www.googleapis.com/auth/youtube.upload';

type YoutubeAuth = { refreshToken: string; channelTitle?: string };

const authPath = path.join(env.storageDir, 'youtubeAuth.json');

function readAuth(): YoutubeAuth | null {
  if (!fs.existsSync(authPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(authPath, 'utf-8'));
  } catch {
    return null;
  }
}

function writeAuth(auth: YoutubeAuth) {
  fs.mkdirSync(path.dirname(authPath), { recursive: true });
  fs.writeFileSync(authPath, JSON.stringify(auth, null, 2));
}

export function isConfigured(): boolean {
  return Boolean(env.youtubeClientId && env.youtubeClientSecret && env.youtubeRedirectUri);
}

export function getConnectionStatus(): { connected: boolean; channelTitle?: string } {
  const auth = readAuth();
  return auth ? { connected: true, channelTitle: auth.channelTitle } : { connected: false };
}

export function disconnect(): void {
  if (fs.existsSync(authPath)) fs.rmSync(authPath);
}

/** Builds the URL the user visits in a browser to grant upload access to their YouTube channel. */
export function getAuthUrl(): string {
  const params = new URLSearchParams({
    client_id: env.youtubeClientId,
    redirect_uri: env.youtubeRedirectUri,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    // Forces Google to re-issue a refresh_token even if this account already granted consent once
    // before — without this, a second connect attempt can silently come back with no refresh_token.
    prompt: 'consent',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

async function fetchChannelTitle(accessToken: string): Promise<string | undefined> {
  try {
    const res = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return undefined;
    const data = (await res.json()) as { items?: Array<{ snippet?: { title?: string } }> };
    return data.items?.[0]?.snippet?.title;
  } catch {
    return undefined;
  }
}

/** Exchanges the OAuth redirect's `code` for tokens and persists the refresh token. */
export async function completeAuth(code: string): Promise<void> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.youtubeClientId,
      client_secret: env.youtubeClientSecret,
      redirect_uri: env.youtubeRedirectUri,
      grant_type: 'authorization_code',
      code,
    }),
  });

  if (!res.ok) {
    throw new Error(`YouTube token exchange failed: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as { access_token: string; refresh_token?: string };
  if (!data.refresh_token) {
    throw new Error(
      'Google did not return a refresh token. Revoke this app\'s access at myaccount.google.com/permissions and try connecting again.',
    );
  }

  const channelTitle = await fetchChannelTitle(data.access_token);
  writeAuth({ refreshToken: data.refresh_token, channelTitle });
}

async function getAccessToken(): Promise<string> {
  const auth = readAuth();
  if (!auth) throw new Error('YouTube is not connected yet.');

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.youtubeClientId,
      client_secret: env.youtubeClientSecret,
      refresh_token: auth.refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!res.ok) {
    throw new Error(`Failed to refresh YouTube access token: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

export type PrivacyStatus = 'private' | 'unlisted' | 'public';

/** Uploads a local mp4 to the connected channel via YouTube's resumable upload protocol. */
export async function uploadVideo(
  filePath: string,
  title: string,
  description: string,
  privacyStatus: PrivacyStatus = 'private',
): Promise<{ videoId: string; url: string }> {
  const accessToken = await getAccessToken();
  const fileSize = fs.statSync(filePath).size;

  const initRes = await fetch(
    'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Upload-Content-Type': 'video/mp4',
        'X-Upload-Content-Length': String(fileSize),
      },
      body: JSON.stringify({
        snippet: { title, description },
        status: { privacyStatus },
      }),
    },
  );

  if (!initRes.ok) {
    throw new Error(`Failed to start YouTube upload: ${initRes.status} ${await initRes.text()}`);
  }

  const uploadUrl = initRes.headers.get('location');
  if (!uploadUrl) {
    throw new Error('YouTube did not return a resumable upload URL.');
  }

  const fileBuffer = fs.readFileSync(filePath);
  const uploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Length': String(fileSize),
    },
    body: fileBuffer,
  });

  if (!uploadRes.ok) {
    throw new Error(`YouTube upload failed: ${uploadRes.status} ${await uploadRes.text()}`);
  }

  const video = (await uploadRes.json()) as { id: string };
  return { videoId: video.id, url: `https://www.youtube.com/watch?v=${video.id}` };
}
