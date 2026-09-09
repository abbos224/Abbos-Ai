import fs from 'node:fs';
import { getPool } from './db.js';
import { env } from './env.js';

// readonly is needed for view/like/comment stats (analytics) — upload alone can't read anything
// back. yt-analytics.readonly is a SEPARATE, narrower scope specifically for the YouTube Analytics
// API (day-by-day views trend) — the Data API's videos.list (readonly, above) only ever returns
// current lifetime totals, never a real time series. An account that connected before this scope
// was added has a refresh token that doesn't cover it; getViewsTrend below treats that as a normal
// "not available yet" case (needs reconnecting), never a crash.
const SCOPE =
  'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/yt-analytics.readonly';

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

/** Parses an ISO 8601 duration ("PT1M30S", "PT45S", "PT2H5M") into whole seconds. Pure and
 * unit-tested — YouTube's Data API returns video length in exactly this format, never plain
 * seconds. */
export function parseIsoDuration(duration: string): number {
  const match = duration.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!match) return 0;
  const [, hours, minutes, seconds] = match;
  return (Number(hours ?? 0) * 3600) + (Number(minutes ?? 0) * 60) + Number(seconds ?? 0);
}

export type DailyViews = { date: string; views: number };

/**
 * Real day-by-day view counts for the connected channel over the last `days` days, straight from
 * the YouTube Analytics API (a separate, narrower-scoped API from the Data API's videos.list above
 * — that one only ever returns a video's current lifetime total, never a real time series). This
 * is the actual mechanism YouTube Studio's own headline "Views" chart is built on. Throws on any
 * failure (including a pre-yt-analytics.readonly-scope connection missing this permission
 * entirely) — callers decide whether that's fatal or just "no trend available yet."
 */
export async function getViewsTrend(userId: string, days = 28): Promise<DailyViews[]> {
  const accessToken = await getAccessToken(userId);
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - (days - 1));
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  const res = await fetch(
    `https://youtubeanalytics.googleapis.com/v2/reports?ids=channel==MINE&startDate=${fmt(start)}&endDate=${fmt(end)}&metrics=views&dimensions=day&sort=day`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) {
    throw new Error(`Failed to fetch views trend: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { rows?: [string, number][] };
  return (data.rows ?? []).map(([date, views]) => ({ date, views }));
}

export type ChannelVideo = {
  videoId: string;
  title: string;
  thumbnailUrl: string;
  publishedAt: string;
  durationSec: number;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  url: string;
};

/**
 * Fetches the connected channel's real uploaded videos directly from YouTube — not just the ones
 * published from inside this app (see analytics.ts's getPublishedClips for that narrower,
 * app-only view). Most-recent-50 for v1 (one playlistItems page): channels.list resolves the
 * account's "uploads" playlist, playlistItems.list lists what's actually on it, then videos.list
 * (reusing the same batching shape as getVideoStats) pulls real title/thumbnail/duration/stats for
 * each. Returns [] (not an error) if the channel genuinely has zero uploads.
 */
export async function getChannelVideos(userId: string, maxResults = 50): Promise<ChannelVideo[]> {
  const accessToken = await getAccessToken(userId);

  const channelRes = await fetch('https://www.googleapis.com/youtube/v3/channels?part=contentDetails&mine=true', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!channelRes.ok) {
    throw new Error(`Failed to look up your channel: ${channelRes.status} ${await channelRes.text()}`);
  }
  const channelData = (await channelRes.json()) as {
    items?: Array<{ contentDetails?: { relatedPlaylists?: { uploads?: string } } }>;
  };
  const uploadsPlaylistId = channelData.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploadsPlaylistId) return [];

  const itemsRes = await fetch(
    `https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&playlistId=${uploadsPlaylistId}&maxResults=${Math.min(maxResults, 50)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!itemsRes.ok) {
    throw new Error(`Failed to list your uploads: ${itemsRes.status} ${await itemsRes.text()}`);
  }
  const itemsData = (await itemsRes.json()) as { items?: Array<{ contentDetails?: { videoId?: string } }> };
  const videoIds = (itemsData.items ?? []).map((item) => item.contentDetails?.videoId).filter((id): id is string => Boolean(id));
  if (videoIds.length === 0) return [];

  const detailsRes = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${videoIds.join(',')}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!detailsRes.ok) {
    throw new Error(`Failed to fetch your videos' details: ${detailsRes.status} ${await detailsRes.text()}`);
  }
  const detailsData = (await detailsRes.json()) as {
    items?: Array<{
      id: string;
      snippet?: { title?: string; publishedAt?: string; thumbnails?: { medium?: { url?: string }; default?: { url?: string } } };
      statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
      contentDetails?: { duration?: string };
    }>;
  };

  return (detailsData.items ?? []).map((item) => ({
    videoId: item.id,
    title: item.snippet?.title ?? '(untitled)',
    thumbnailUrl: item.snippet?.thumbnails?.medium?.url ?? item.snippet?.thumbnails?.default?.url ?? '',
    publishedAt: item.snippet?.publishedAt ?? '',
    durationSec: parseIsoDuration(item.contentDetails?.duration ?? 'PT0S'),
    viewCount: Number(item.statistics?.viewCount ?? 0),
    likeCount: Number(item.statistics?.likeCount ?? 0),
    commentCount: Number(item.statistics?.commentCount ?? 0),
    url: `https://www.youtube.com/watch?v=${item.id}`,
  }));
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
