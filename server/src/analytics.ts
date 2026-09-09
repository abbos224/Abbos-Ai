import type { Clip, Job } from './store.js';
import type { ChannelVideo } from './youtube.js';

export type PublishedEntry = { jobId: string; clip: Clip; videoId: string };

/** Pulls the `v=` video id out of a `https://www.youtube.com/watch?v=...` URL. Pure and easy to
 * unit-test independently of the YouTube API client. */
export function extractYoutubeVideoId(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.searchParams.get('v');
  } catch {
    return null;
  }
}

/** Every clip across every job that has actually been published to YouTube, with its video id
 * already extracted (clips whose URL doesn't parse are skipped rather than surfaced as broken). */
export function getPublishedClips(jobs: Job[]): PublishedEntry[] {
  return jobs
    .flatMap((job) => job.clips.map((clip) => ({ jobId: job.id, clip })))
    .filter((entry): entry is { jobId: string; clip: Clip } => Boolean(entry.clip.publishedYoutubeUrl))
    .map((entry) => ({ ...entry, videoId: extractYoutubeVideoId(entry.clip.publishedYoutubeUrl!) }))
    .filter((entry): entry is PublishedEntry => entry.videoId !== null);
}

export type ChannelSummary = { totalViews: number; totalVideos: number; avgEngagementRate: number };

/** Headline dashboard numbers — real sums/averages over the channel's actual videos, nothing
 * estimated. `avgEngagementRate` is 0-1 (likes+comments / views, averaged only over videos that
 * have at least one view, same guard computeChannelInsights' own engagement figure uses). Pure and
 * unit-tested. */
export function computeChannelSummary(videos: ChannelVideo[]): ChannelSummary {
  const totalViews = videos.reduce((sum, v) => sum + v.viewCount, 0);
  const withViews = videos.filter((v) => v.viewCount > 0);
  const avgEngagementRate =
    withViews.length > 0
      ? withViews.reduce((sum, v) => sum + (v.likeCount + v.commentCount) / v.viewCount, 0) / withViews.length
      : 0;
  return { totalViews, totalVideos: videos.length, avgEngagementRate };
}

export type ChannelInsight = { label: string; detail: string };

/** Real YouTube titles routinely run long and end in a wall of jammed-together hashtags
 * ("...to change your life.#motivation #mindset #dailyinspiration") — fine as a video's own full
 * title in a list, but unreadable embedded mid-sentence inside a one-line insight. Trims to a
 * clean word boundary under `maxLen` rather than cutting mid-word. Pure and unit-tested. */
export function truncateTitle(title: string, maxLen = 40): string {
  if (title.length <= maxLen) return title;
  const cut = title.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(' ');
  // Strip any trailing '.'/'…' the real title already ended that clause with, so the cut never
  // reads as a doubled-up ellipsis ("moment...…") — just one clean "…" of our own.
  const trimmed = (lastSpace > 10 ? cut.slice(0, lastSpace) : cut).replace(/[.…\s]+$/, '');
  return `${trimmed}…`;
}

/**
 * Real, data-grounded observations about a connected channel's actual videos — every number here
 * traces back to a real view/like/comment/duration value from `videos`, never a generic tip
 * unrelated to this specific channel's own data. Each insight is only included when there's
 * genuinely enough data to support it (e.g. the format comparison needs at least 2 videos on each
 * side, or it's silently skipped rather than drawing a conclusion from too little to matter). Pure
 * and unit-tested.
 */
export function computeChannelInsights(videos: ChannelVideo[]): ChannelInsight[] {
  if (videos.length === 0) return [];
  const insights: ChannelInsight[] = [];

  const totalViews = videos.reduce((sum, v) => sum + v.viewCount, 0);
  const avgViews = totalViews / videos.length;

  const top = [...videos].sort((a, b) => b.viewCount - a.viewCount)[0];
  if (top.viewCount > 0) {
    const timesAvg = avgViews > 0 ? top.viewCount / avgViews : 0;
    insights.push({
      label: 'Top performer',
      detail:
        `"${truncateTitle(top.title)}" leads with ${top.viewCount.toLocaleString()} views` +
        (timesAvg >= 1.3 ? ` — ${timesAvg.toFixed(1)}x your channel average` : ''),
    });
  }

  const withViews = videos.filter((v) => v.viewCount > 0);
  if (withViews.length >= 2) {
    const avgEngagementRate =
      withViews.reduce((sum, v) => sum + (v.likeCount + v.commentCount) / v.viewCount, 0) / withViews.length;
    insights.push({
      label: 'Engagement',
      detail: `On average, ${(avgEngagementRate * 100).toFixed(1)}% of viewers like or comment`,
    });
  }

  const shorts = videos.filter((v) => v.durationSec > 0 && v.durationSec <= 60);
  const longform = videos.filter((v) => v.durationSec > 60);
  if (shorts.length >= 2 && longform.length >= 2) {
    const shortsAvgViews = shorts.reduce((sum, v) => sum + v.viewCount, 0) / shorts.length;
    const longformAvgViews = longform.reduce((sum, v) => sum + v.viewCount, 0) / longform.length;
    if (shortsAvgViews > 0 || longformAvgViews > 0) {
      const shortsWin = shortsAvgViews >= longformAvgViews;
      const ratio = shortsWin
        ? longformAvgViews > 0
          ? shortsAvgViews / longformAvgViews
          : 0
        : shortsAvgViews > 0
          ? longformAvgViews / shortsAvgViews
          : 0;
      insights.push({
        label: 'Format',
        detail:
          `${shortsWin ? 'Videos under a minute' : 'Longer videos'} average more views on your channel` +
          (ratio >= 1.2 ? ` (${ratio.toFixed(1)}x)` : ''),
      });
    }
  }

  return insights;
}
