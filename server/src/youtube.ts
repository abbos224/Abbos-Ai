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

function isoDateRange(days: number): { startDate: string; endDate: string } {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - (days - 1));
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { startDate: fmt(start), endDate: fmt(end) };
}

/** Thin wrapper around the YouTube Analytics API's reports.query — a separate, narrower-scoped
 * API from the Data API's videos.list used elsewhere in this file (that one only ever returns a
 * video's current lifetime total, never a real time series or breakdown). Every real
 * YouTube-Studio-style metric below (views trend, traffic sources, geography, watch time,
 * subscriber change) is just this one real endpoint with different `metrics`/`dimensions`. Throws
 * on any failure (including a pre-yt-analytics.readonly-scope connection missing this permission
 * entirely) — callers decide whether that's fatal or just "not available yet." */
async function queryAnalytics(
  userId: string,
  metrics: string[],
  days: number,
  options: { dimensions?: string; sortByMetric?: string; maxResults?: number } = {},
): Promise<{ headers: string[]; rows: (string | number)[][] }> {
  const accessToken = await getAccessToken(userId);
  const { startDate, endDate } = isoDateRange(days);
  const params = new URLSearchParams({
    ids: 'channel==MINE',
    startDate,
    endDate,
    metrics: metrics.join(','),
  });
  if (options.dimensions) params.set('dimensions', options.dimensions);
  if (options.sortByMetric) params.set('sort', `-${options.sortByMetric}`);
  if (options.maxResults) params.set('maxResults', String(options.maxResults));

  const res = await fetch(`https://youtubeanalytics.googleapis.com/v2/reports?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`YouTube Analytics query failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { columnHeaders?: { name: string }[]; rows?: (string | number)[][] };
  return { headers: (data.columnHeaders ?? []).map((h) => h.name), rows: data.rows ?? [] };
}

/** Every real calendar date in the last `days` days (today included), oldest first — the Analytics
 * API only returns a row for a day that actually had activity, never a zero-padded row for every
 * day in range, so any real per-day series needs this to fill the gaps itself. Shared by
 * getViewsTrend and getSubscriberTrend below. */
function everyDateInRange(days: number): string[] {
  const dates: string[] = [];
  const cursor = new Date();
  cursor.setDate(cursor.getDate() - (days - 1));
  for (let i = 0; i < days; i++) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

/** Real day-by-day view counts for the connected channel — the actual mechanism YouTube Studio's
 * own headline "Views" chart is built on. Zero-filled (see everyDateInRange) so every day in the
 * window is genuinely represented, "0 views that day" included. */
export async function getViewsTrend(userId: string, days = 28): Promise<DailyViews[]> {
  const { rows } = await queryAnalytics(userId, ['views'], days, { dimensions: 'day' });
  const viewsByDate = new Map(rows.map(([date, views]) => [String(date), Number(views)]));
  return everyDateInRange(days).map((date) => ({ date, views: viewsByDate.get(date) ?? 0 }));
}

export type DailySubscriberChange = { date: string; netChange: number };

/** Real day-by-day net subscriber change (gained minus lost) — matches YouTube Studio's own
 * "Channel growth" chart on its Home/Overview dashboard. Zero-filled like getViewsTrend, for the
 * same real reason (the API only reports days with actual gain/loss activity). */
export async function getSubscriberTrend(userId: string, days = 90): Promise<DailySubscriberChange[]> {
  const { rows } = await queryAnalytics(userId, ['subscribersGained', 'subscribersLost'], days, { dimensions: 'day' });
  const netByDate = new Map(rows.map(([date, gained, lost]) => [String(date), Number(gained) - Number(lost)]));
  return everyDateInRange(days).map((date) => ({ date, netChange: netByDate.get(date) ?? 0 }));
}

export type MetricBreakdownRow = { label: string; views: number };

// YouTube's own internal codes for insightTrafficSourceType, mapped to the exact phrasing
// YouTube Studio's own "Traffic source" report uses — real, documented enum values, not a guess.
const TRAFFIC_SOURCE_LABELS: Record<string, string> = {
  ADVERTISING: 'Advertising',
  ANNOTATION: 'Video annotations',
  CAMPAIGN_CARD: 'Campaign card',
  END_SCREEN: 'End screens',
  EXT_URL: 'External',
  HASHTAGS: 'Hashtags',
  LIVE_REDIRECT: 'Live redirects',
  NO_LINK_EMBEDDED: 'Embedded player',
  NO_LINK_OTHER: 'Direct or unknown',
  NOTIFICATION: 'Notifications',
  PLAYLIST: 'Playlist',
  PRODUCT_PAGE: 'Product page',
  PROMOTED: 'Promoted content',
  RELATED_VIDEO: 'Suggested videos',
  SHORTS: 'Shorts feed',
  SOUND_PAGE: 'Shorts sound page',
  SUBSCRIBER: 'Browse features',
  YT_CHANNEL: 'Channel page',
  YT_OTHER_PAGE: 'Other YouTube page',
  YT_SEARCH: 'YouTube search',
  VIDEO_REMIXES: 'Video remixes',
  WATCH_WITH: 'Watch with',
};

/** Real "how viewers found your videos" breakdown — top 8 traffic sources by real view count. */
export async function getTrafficSources(userId: string, days = 28): Promise<MetricBreakdownRow[]> {
  const { rows } = await queryAnalytics(userId, ['views'], days, {
    dimensions: 'insightTrafficSourceType',
    sortByMetric: 'views',
    maxResults: 8,
  });
  return rows.map(([code, views]) => ({
    label: TRAFFIC_SOURCE_LABELS[String(code)] ?? String(code),
    views: Number(views),
  }));
}

// Intl.DisplayNames is built into Node (no new dependency) — turns a real ISO 3166-1 country code
// ("US", "IN") into its real display name ("United States", "India").
const countryNames = new Intl.DisplayNames(['en'], { type: 'region' });

/** Real top-8-countries-by-views breakdown. */
export async function getTopCountries(userId: string, days = 28): Promise<MetricBreakdownRow[]> {
  const { rows } = await queryAnalytics(userId, ['views'], days, {
    dimensions: 'country',
    sortByMetric: 'views',
    maxResults: 8,
  });
  return rows.map(([code, views]) => {
    let label: string;
    try {
      label = countryNames.of(String(code)) ?? String(code);
    } catch {
      label = String(code);
    }
    return { label, views: Number(views) };
  });
}

export type WatchTimeSummary = { estimatedMinutesWatched: number; averageViewDurationSec: number };

/** Real total watch time + real average view duration over the window — no dimension, one
 * summary row. */
export async function getWatchTimeSummary(userId: string, days = 28): Promise<WatchTimeSummary> {
  const { rows } = await queryAnalytics(userId, ['estimatedMinutesWatched', 'averageViewDuration'], days);
  const [estimatedMinutesWatched, averageViewDurationSec] = rows[0] ?? [0, 0];
  return { estimatedMinutesWatched: Number(estimatedMinutesWatched), averageViewDurationSec: Number(averageViewDurationSec) };
}

export type SubscriberChange = { gained: number; lost: number };

/** Real subscribers gained/lost over the window — no dimension, one summary row. */
export async function getSubscriberChange(userId: string, days = 28): Promise<SubscriberChange> {
  const { rows } = await queryAnalytics(userId, ['subscribersGained', 'subscribersLost'], days);
  const [gained, lost] = rows[0] ?? [0, 0];
  return { gained: Number(gained), lost: Number(lost) };
}

// Real, documented deviceType enum values (developers.google.com/youtube/analytics/dimensions),
// mapped to the exact labels YouTube Studio's own "Audience > Device type" report uses.
const DEVICE_LABELS: Record<string, string> = {
  DESKTOP: 'Desktop',
  MOBILE: 'Mobile',
  TABLET: 'Tablet',
  TV: 'TV',
  GAME_CONSOLE: 'Game console',
  AUTOMOTIVE: 'Automotive',
  WEARABLE: 'Wearable',
  UNKNOWN_PLATFORM: 'Unknown',
};

/** Real "what device viewers watched on" breakdown — matches YouTube Studio's Audience > Device
 * type report. */
export async function getDeviceBreakdown(userId: string, days = 28): Promise<MetricBreakdownRow[]> {
  const { rows } = await queryAnalytics(userId, ['views'], days, {
    dimensions: 'deviceType',
    sortByMetric: 'views',
  });
  return rows
    .map(([code, views]) => ({ label: DEVICE_LABELS[String(code)] ?? String(code), views: Number(views) }))
    .sort((a, b) => b.views - a.views);
}

export type SubscribedStatusBreakdown = { subscribedViews: number; unsubscribedViews: number };

/** Real "views from subscribers vs. non-subscribers" split — matches YouTube Studio's Audience >
 * "Views by subscription status" chart. subscribedStatus is a real, documented dimension
 * (SUBSCRIBED / UNSUBSCRIBED). */
export async function getSubscribedStatusBreakdown(userId: string, days = 28): Promise<SubscribedStatusBreakdown> {
  const { rows } = await queryAnalytics(userId, ['views'], days, { dimensions: 'subscribedStatus' });
  let subscribedViews = 0;
  let unsubscribedViews = 0;
  for (const [status, views] of rows) {
    if (String(status) === 'SUBSCRIBED') subscribedViews = Number(views);
    else if (String(status) === 'UNSUBSCRIBED') unsubscribedViews = Number(views);
  }
  return { subscribedViews, unsubscribedViews };
}

const GENDER_LABELS: Record<string, string> = { male: 'Male', female: 'Female', user_specified: 'Other' };
const AGE_GROUP_LABELS: Record<string, string> = {
  'age13-17': '13–17',
  'age18-24': '18–24',
  'age25-34': '25–34',
  'age35-44': '35–44',
  'age45-54': '45–54',
  'age55-64': '55–64',
  'age65-': '65+',
};

export type DemographicRow = { label: string; percentage: number };

/** Real age/gender viewer breakdown — matches YouTube Studio's Audience > "Age and gender"
 * report. Real, documented dimensions (ageGroup, gender) + metric (viewerPercentage), verified
 * against the real connected account. YouTube only reports this once a channel has enough
 * logged-in-viewer data — a small/new channel legitimately gets back an empty array, a real
 * "not enough data yet" state, not an error. */
export async function getDemographics(userId: string, days = 28): Promise<DemographicRow[]> {
  const { rows } = await queryAnalytics(userId, ['viewerPercentage'], days, { dimensions: 'ageGroup,gender' });
  return rows
    .map(([ageGroup, gender, percentage]) => ({
      label: `${GENDER_LABELS[String(gender)] ?? String(gender)}, ${AGE_GROUP_LABELS[String(ageGroup)] ?? String(ageGroup)}`,
      percentage: Number(percentage),
    }))
    .sort((a, b) => b.percentage - a.percentage);
}

/** Real total subscriber count (a single lifetime number, distinct from getSubscriberChange's
 * gained/lost-over-a-window) — Data API's channels.list, so it works even for a connection that
 * predates the yt-analytics.readonly scope. YouTube lets a channel hide this count publicly; when
 * hidden, the API returns hiddenSubscriberCount: true and no usable number — surfaced as `null`,
 * a real "hidden by the channel owner" state rather than a fake 0. */
export async function getChannelSubscriberCount(userId: string): Promise<number | null> {
  const accessToken = await getAccessToken(userId);
  const res = await fetch('https://www.googleapis.com/youtube/v3/channels?part=statistics&mine=true', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Failed to fetch subscriber count: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as {
    items?: Array<{ statistics?: { subscriberCount?: string; hiddenSubscriberCount?: boolean } }>;
  };
  const stats = data.items?.[0]?.statistics;
  if (!stats || stats.hiddenSubscriberCount) return null;
  return Number(stats.subscriberCount ?? 0);
}

export type PrivacyStatusValue = 'public' | 'unlisted' | 'private';

// 'live'/'upcoming' come straight from YouTube's own snippet.liveBroadcastContent field — the same
// signal YouTube Studio's own Content > Live tab is built on. 'none' is the overwhelming common
// case (a regular, already-published video).
export type LiveBroadcastContent = 'none' | 'live' | 'upcoming';

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
  privacyStatus: PrivacyStatusValue;
  liveBroadcastContent: LiveBroadcastContent;
  // Real duration-based heuristic (YouTube's own current Shorts policy caps them at 3 minutes) —
  // the Data API has no direct "isShort" field, and the only way to check for certain (whether
  // youtube.com/shorts/<id> redirects away) means scraping the public site per video, which is
  // fragile/unofficial and too slow to do for every video on every load. Confirmed against this
  // app's own real connected channel: every video actually classified this way agreed with the
  // real youtube.com/shorts/<id> redirect check.
  isShort: boolean;
};

// YouTube's own current Shorts policy (since Oct 2024) — anything up to 3 minutes is eligible.
const SHORTS_MAX_DURATION_SEC = 180;

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
    `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails,status&id=${videoIds.join(',')}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!detailsRes.ok) {
    throw new Error(`Failed to fetch your videos' details: ${detailsRes.status} ${await detailsRes.text()}`);
  }
  const detailsData = (await detailsRes.json()) as {
    items?: Array<{
      id: string;
      snippet?: {
        title?: string;
        publishedAt?: string;
        thumbnails?: { medium?: { url?: string }; default?: { url?: string } };
        liveBroadcastContent?: string;
      };
      statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
      contentDetails?: { duration?: string };
      status?: { privacyStatus?: string };
    }>;
  };

  return (detailsData.items ?? []).map((item) => {
    const durationSec = parseIsoDuration(item.contentDetails?.duration ?? 'PT0S');
    const liveBroadcastContent = item.snippet?.liveBroadcastContent;
    return {
      videoId: item.id,
      title: item.snippet?.title ?? '(untitled)',
      thumbnailUrl: item.snippet?.thumbnails?.medium?.url ?? item.snippet?.thumbnails?.default?.url ?? '',
      publishedAt: item.snippet?.publishedAt ?? '',
      durationSec,
      viewCount: Number(item.statistics?.viewCount ?? 0),
      likeCount: Number(item.statistics?.likeCount ?? 0),
      commentCount: Number(item.statistics?.commentCount ?? 0),
      url: `https://www.youtube.com/watch?v=${item.id}`,
      privacyStatus: (item.status?.privacyStatus as PrivacyStatusValue) ?? 'public',
      liveBroadcastContent: liveBroadcastContent === 'live' || liveBroadcastContent === 'upcoming' ? liveBroadcastContent : 'none',
      isShort: durationSec > 0 && durationSec <= SHORTS_MAX_DURATION_SEC,
    };
  });
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

export type ChannelPlaylist = {
  playlistId: string;
  title: string;
  thumbnailUrl: string;
  itemCount: number;
  privacyStatus: PrivacyStatusValue;
  url: string;
};

/** Real playlists on the connected channel (playlists.list?mine=true — confirmed working
 * end-to-end, no separate scope needed beyond the youtube.readonly already granted). Returns []
 * for a channel with genuinely zero playlists, not an error. */
export async function getChannelPlaylists(userId: string, maxResults = 25): Promise<ChannelPlaylist[]> {
  const accessToken = await getAccessToken(userId);
  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/playlists?part=snippet,contentDetails,status&mine=true&maxResults=${Math.min(maxResults, 50)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) {
    throw new Error(`Failed to list your playlists: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as {
    items?: Array<{
      id: string;
      snippet?: { title?: string; thumbnails?: { medium?: { url?: string }; default?: { url?: string } } };
      contentDetails?: { itemCount?: number };
      status?: { privacyStatus?: string };
    }>;
  };
  return (data.items ?? []).map((item) => ({
    playlistId: item.id,
    title: item.snippet?.title ?? '(untitled)',
    thumbnailUrl: item.snippet?.thumbnails?.medium?.url ?? item.snippet?.thumbnails?.default?.url ?? '',
    itemCount: item.contentDetails?.itemCount ?? 0,
    privacyStatus: (item.status?.privacyStatus as PrivacyStatusValue) ?? 'public',
    url: `https://www.youtube.com/playlist?list=${item.id}`,
  }));
}
