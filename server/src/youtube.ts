import fs from 'node:fs';
import { getPool } from './db.js';
import { env } from './env.js';

// readonly is needed for view/like/comment stats (analytics) — upload alone can't read anything back.
const SCOPE = 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly';

type YoutubeAuth = { refreshToken: string; channelTitle?: string };

async function readAuth(userId: string): Promise<YoutubeAuth | null> {
  const result = await getPool().query<{ refresh_token: string; channel_title: string | null }>(
    'SELECT refresh_token, channel_title FROM youtube_auth WHERE user_id = $1',
    [userId],
  );
  const row = result.rows[0];
  return row ? { refreshToken: row.refresh_token, channelTitle: row.channel_title ?? undefined } : null;
}

async function writeAuth(userId: string, auth: YoutubeAuth): Promise<void> {
  await getPool().query(
    `INSERT INTO youtube_auth (user_id, refresh_token, channel_title)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id) DO UPDATE SET
       refresh_token = EXCLUDED.refresh_token,
       channel_title = EXCLUDED.channel_title`,
    [userId, auth.refreshToken, auth.channelTitle ?? null],
  );
}

export function isConfigured(): boolean {
  return Boolean(env.youtubeClientId && env.youtubeClientSecret && env.youtubeRedirectUri);
}

export async function getConnectionStatus(userId: string): Promise<{ connected: boolean; channelTitle?: string }> {
  const auth = await readAuth(userId);
  return auth ? { connected: true, channelTitle: auth.channelTitle } : { connected: false };
}

export async function disconnect(userId: string): Promise<void> {
  await getPool().query('DELETE FROM youtube_auth WHERE user_id = $1', [userId]);
}

/**
 * Builds the URL the user visits in a browser to grant upload access to their YouTube channel.
 * `state` is opaque to Google — it's echoed back verbatim on the redirect to
 * /oauth/youtube/callback, which is how that route recovers which account started this flow (see
 * auth.ts's signOAuthState/verifyOAuthState — there's no Authorization header available here since
 * this is a real browser navigation, not a fetch from our own app).
 */
export function getAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: env.youtubeClientId,
    redirect_uri: env.youtubeRedirectUri,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    // Forces Google to re-issue a refresh_token even if this account already granted consent once
    // before — without this, a second connect attempt can silently come back with no refresh_token.
    prompt: 'consent',
    state,
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

/** Exchanges the OAuth redirect's `code` for tokens and persists the refresh token for `userId`. */
export async function completeAuth(userId: string, code: string): Promise<void> {
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
  await writeAuth(userId, { refreshToken: data.refresh_token, channelTitle });
}

async function getAccessToken(userId: string): Promise<string> {
  const auth = await readAuth(userId);
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
  userId: string,
  filePath: string,
  title: string,
  description: string,
  privacyStatus: PrivacyStatus = 'private',
): Promise<{ videoId: string; url: string }> {
  const accessToken = await getAccessToken(userId);
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

export type VideoStats = { videoId: string; viewCount: number; likeCount: number; commentCount: number };

/**
 * Batch-fetches view/like/comment counts for up to 50 video IDs per call (the Data API's own
 * limit) via a single `videos.list` request. Skips IDs the API doesn't return anything for
 * (e.g. a video deleted from YouTube Studio after being published from here) rather than failing.
 */
export async function getVideoStats(userId: string, videoIds: string[]): Promise<VideoStats[]> {
  if (videoIds.length === 0) return [];
  const accessToken = await getAccessToken(userId);

  const results: VideoStats[] = [];
  for (let i = 0; i < videoIds.length; i += 50) {
    const batch = videoIds.slice(i, i + 50);
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${batch.join(',')}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!res.ok) {
      throw new Error(`Failed to fetch YouTube video stats: ${res.status} ${await res.text()}`);
    }
    const data = (await res.json()) as {
      items?: Array<{ id: string; statistics?: { viewCount?: string; likeCount?: string; commentCount?: string } }>;
    };
    for (const item of data.items ?? []) {
      results.push({
        videoId: item.id,
        viewCount: Number(item.statistics?.viewCount ?? 0),
        likeCount: Number(item.statistics?.likeCount ?? 0),
        commentCount: Number(item.statistics?.commentCount ?? 0),
      });
    }
  }
  return results;
}
