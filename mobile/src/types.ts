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
};

/** A real, data-grounded observation about the channel's actual videos (see server's
 * computeChannelInsights) — never a generic tip unrelated to this channel's own numbers. */
export type ChannelInsight = { label: string; detail: string };

/** Headline dashboard numbers — real sums/averages over the channel's actual videos. */
export type ChannelSummary = { totalViews: number; totalVideos: number; avgEngagementRate: number };

export type DailyViews = { date: string; views: number };

/** Real second-half-vs-first-half comparison over the views trend window — changePercent is null
 * (not 0) when the previous period had zero views, since a percent change from zero isn't a real
 * number. */
export type TrendChange = { currentPeriodViews: number; previousPeriodViews: number; changePercent: number | null };

export type YoutubeAnalytics = {
  videos: ChannelVideo[];
  insights: ChannelInsight[];
  summary: ChannelSummary;
  // null when the connected account hasn't granted the yt-analytics.readonly scope yet (accounts
  // connected before it was added) — a real "reconnect for this" state, not an error.
  trend: DailyViews[] | null;
  trendChange: TrendChange | null;
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
