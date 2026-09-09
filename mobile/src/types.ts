export type ClipScore = {
  hook: number;
  retention: number;
  emotion: number;
  clarity: number;
  shareability: number;
  cta: number;
};

export type ClipStatus = 'pending' | 'rendering' | 'done' | 'failed';

export type Translation = {
  id: string;
  language: string;
  languageLabel: string;
  hook: string;
  status: 'rendering' | 'done' | 'failed';
  outputFile?: string;
  error?: string;
};

export type Language = { code: string; label: string };

export type RegenerateModifier = 'moreViral' | 'moreProfessional' | 'moreEmotional' | 'moreLuxury';

export type Regeneration = {
  id: string;
  modifier: RegenerateModifier;
  modifierLabel: string;
  hookOptions: string[];
  chosenHook: string;
  cta: string;
  coverOptions: string[];
  coverImages?: string[];
  socialCaption?: SocialCaption;
  status: 'rendering' | 'done' | 'failed';
  outputFile?: string;
  error?: string;
};

export type SocialCaption = {
  short: string;
  medium: string;
  long: string;
  hashtags: string[];
  keywords: string[];
};

export type Clip = {
  id: string;
  jobId: string;
  startTime: number;
  endTime: number;
  topic: string;
  score: number;
  scoreBreakdown: ClipScore;
  scoreRationale?: string;
  hookOptions: string[];
  chosenHook: string;
  cta: string;
  coverOptions: string[];
  coverImages?: string[];
  socialCaption?: SocialCaption;
  status: ClipStatus;
  outputFile?: string;
  error?: string;
  translations?: Translation[];
  regenerations?: Regeneration[];
  scheduledFor?: string;
  publishedYoutubeUrl?: string;
  captionOverrides?: WordFormatOverride[];
};

/** One word's manual formatting override (EditCaptionsScreen) — keyed by `start` (seconds), the
 * same value the /caption-words route echoes back for that word, so no id-generation is needed. */
export type WordFormatOverride = {
  start: number;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  highlightColor?: string;
  scale?: number;
};

/** A word from the real transcript, as returned by GET /jobs/:jobId/clips/:clipId/caption-words —
 * carries its own current override fields (if any) merged in already. */
export type CaptionWord = {
  start: number;
  end: number;
  text: string;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  highlightColor?: string;
  scale?: number;
};

export type YoutubeStatus = { configured: boolean; connected: boolean; channelTitle?: string };

export type CalendarEntry = {
  jobId: string;
  clipId: string;
  scheduledFor: string;
  topic: string;
  chosenHook: string;
  outputFile?: string;
};

export type PrivacyStatusValue = 'public' | 'unlisted' | 'private';

// 'live'/'upcoming' come straight from YouTube's own snippet.liveBroadcastContent — the same
// signal YouTube Studio's own Content > Live tab is built on.
export type LiveBroadcastContent = 'none' | 'live' | 'upcoming';

/** A real video on the connected YouTube channel — every video actually on the channel, not just
 * ones published from inside this app (topic/chosenHook/publishedFromApp are only set for the
 * ones that were). */
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
  topic?: string;
  chosenHook?: string;
  publishedFromApp: boolean;
  privacyStatus: PrivacyStatusValue;
  liveBroadcastContent: LiveBroadcastContent;
  // Real duration-based heuristic (YouTube caps Shorts at 3 minutes) — see server's youtube.ts
  // for why this, not a scrape-based check, is what backs this flag.
  isShort: boolean;
};

/** A real playlist on the connected channel. */
export type ChannelPlaylist = {
  playlistId: string;
  title: string;
  thumbnailUrl: string;
  itemCount: number;
  privacyStatus: PrivacyStatusValue;
  url: string;
};

/** A real, data-grounded observation about the channel's actual videos (see server's
 * computeChannelInsights) — never a generic tip unrelated to this channel's own numbers. */
export type ChannelInsight = { label: string; detail: string };

/** Headline dashboard numbers — real sums/averages over the channel's actual videos. */
export type ChannelSummary = { totalViews: number; totalVideos: number; avgEngagementRate: number };

export type DailyViews = { date: string; views: number };

/** Real day-by-day net subscriber change (gained minus lost) — matches YouTube Studio's own
 * "Channel growth" chart. */
export type DailySubscriberChange = { date: string; netChange: number };

/** Real second-half-vs-first-half comparison over the views trend window — changePercent is null
 * (not 0) when the previous period had zero views, since a percent change from zero isn't a real
 * number. */
export type TrendChange = { currentPeriodViews: number; previousPeriodViews: number; changePercent: number | null };

/** One row of a real breakdown list (traffic source or country), sorted by views descending. */
export type BreakdownRow = { label: string; views: number };

export type WatchTimeSummary = { estimatedMinutesWatched: number; averageViewDurationSec: number };

export type SubscriberChange = { gained: number; lost: number };

/** Real "views from subscribers vs. non-subscribers" split — YouTube's subscribedStatus
 * dimension. */
export type SubscribedStatusBreakdown = { subscribedViews: number; unsubscribedViews: number };

/** Real age/gender viewer split — YouTube only reports this once a channel has enough logged-in
 * viewer data, so an empty array is a real "not enough data yet" state, not an error. */
export type DemographicRow = { label: string; percentage: number };

export type ChannelBreakdown = {
  trafficSources: BreakdownRow[];
  topCountries: BreakdownRow[];
  watchTime: WatchTimeSummary;
  subscribers: SubscriberChange;
  deviceTypes: BreakdownRow[];
  subscribedStatus: SubscribedStatusBreakdown;
  demographics: DemographicRow[];
};

export type YoutubeAnalytics = {
  videos: ChannelVideo[];
  playlists: ChannelPlaylist[];
  insights: ChannelInsight[];
  summary: ChannelSummary;
  // The real day-window this whole response was computed over (7/28/90/365) — echoes back
  // whatever ?days= was requested (or the 90-day default).
  days: number;
  // null when the connected account hasn't granted the yt-analytics.readonly scope yet (accounts
  // connected before it was added) — a real "reconnect for this" state, not an error.
  trend: DailyViews[] | null;
  trendChange: TrendChange | null;
  subscriberTrend: DailySubscriberChange[] | null;
  breakdown: ChannelBreakdown | null;
  // Real lifetime subscriber count (Data API, works even without the analytics scope). null means
  // the channel owner has hidden it publicly — a real YouTube setting, not a failed fetch.
  subscriberCount: number | null;
};

/** One point on a real per-video audience-retention curve (YouTube's own elapsedVideoTimeRatio
 * dimension + audienceWatchRatio/relativeRetentionPerformance metrics) — elapsedRatio is 0-1
 * (percent of the video's own length), relativeRetentionPerformance is 0-1 vs. similar-length
 * YouTube videos (this is what Studio's retention graph actually plots), audienceWatchRatio can
 * exceed 1 where a moment is commonly rewatched. */
export type RetentionPoint = { elapsedRatio: number; audienceWatchRatio: number; relativeRetentionPerformance: number };

/** Real per-video analytics — matches YouTube Studio's own per-video detail page. Queried over the
 * video's real full lifetime, not a fixed recent window, so trend is NOT zero-filled (a video's
 * real activity is usually a handful of days within a potentially long lifetime). */
export type VideoAnalytics = {
  trend: DailyViews[];
  retentionCurve: RetentionPoint[];
  trafficSources: BreakdownRow[];
};

export type JobStatus = 'uploaded' | 'transcribing' | 'analyzing' | 'rendering' | 'done' | 'failed';

export type Job = {
  id: string;
  originalFilename: string;
  sourceFile: string;
  durationSec?: number;
  width?: number;
  height?: number;
  status: JobStatus;
  error?: string;
  createdAt: string;
  clips: Clip[];
};

export type CaptionStyleName =
  | 'bold' | 'minimal' | 'podcast' | 'kinetic' | 'luxury' | 'gaming'
  | 'karaoke' | 'wordPop' | 'highlightBox' | 'emphasisWord';

export type SoundEffectsStyle = 'professional' | 'minimal' | 'dynamic';

export type BrandKit = {
  logoUrl?: string;
  accentColor?: string;
  captionStyle?: CaptionStyleName;
  soundEffectsStyle?: SoundEffectsStyle;
};

export type PersonaName = 'trustedAdvisor' | 'boldContrarian' | 'friendlyNeighbor' | 'luxuryConcierge' | 'energeticCoach';

export type Persona = { name: PersonaName; label: string; description: string };

export type AuthUser = { id: string; email: string; emailVerified: boolean };

export type JobSummary = { id: string; originalFilename: string; status: JobStatus; createdAt: string; clipCount: number };

export type Idea = {
  id: string;
  hook: string;
  script: string;
  cta: string;
  socialCaption?: SocialCaption;
};

export type IdeaJobStatus = 'generating' | 'done' | 'failed';

export type IdeaJob = {
  id: string;
  topic: string;
  status: IdeaJobStatus;
  error?: string;
  createdAt: string;
  ideas: Idea[];
};

export type IdeaJobSummary = { id: string; topic: string; status: IdeaJobStatus; createdAt: string; ideaCount: number };

export type ImageJobStatus = 'generating' | 'done' | 'failed';

export type ImageJobMode = 'generate' | 'edit';

export type ImageJob = {
  id: string;
  prompt: string;
  mode: ImageJobMode;
  status: ImageJobStatus;
  error?: string;
  createdAt: string;
  outputFile?: string;
};

export type ImageJobSummary = Omit<ImageJob, 'error'>;

export type ImageQuota = { used: number; limit: number; remaining: number };

export type RootStackParamList = {
  Upload: undefined;
  Processing: { jobId: string };
  Results: { jobId: string };
  Preview: { clip: Clip };
  EditCaptions: { clip: Clip };
  BrandKit: undefined;
  Calendar: undefined;
  Personas: undefined;
  Analytics: undefined;
  VideoAnalytics: { video: ChannelVideo };
  Login: undefined;
  SignUp: undefined;
  ForgotPassword: undefined;
  ResetPassword: { email: string };
  Projects: undefined;
  Menu: undefined;
  IdeaGenerator: undefined;
  IdeaResults: { ideaJobId: string };
  ImageGenerator: { continueFromJobId?: string } | undefined;
  ImageResult: { imageJobId: string };
};
