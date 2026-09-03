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

export type AnalyticsEntry = {
  jobId: string;
  clipId: string;
  topic: string;
  chosenHook: string;
  url: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
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

export type CaptionStyleName = 'bold' | 'minimal' | 'podcast' | 'kinetic' | 'luxury' | 'gaming';

export type SoundEffectsStyle = 'professional' | 'minimal' | 'dynamic';

export type BrandKit = {
  logoUrl?: string;
  accentColor?: string;
  captionStyle?: CaptionStyleName;
  soundEffectsStyle?: SoundEffectsStyle;
};

export type PersonaName = 'trustedAdvisor' | 'boldContrarian' | 'friendlyNeighbor' | 'luxuryConcierge' | 'energeticCoach';

export type Persona = { name: PersonaName; label: string; description: string };

export type AuthUser = { id: string; email: string };

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
  BrandKit: undefined;
  Calendar: undefined;
  Personas: undefined;
  Analytics: undefined;
  Login: undefined;
  SignUp: undefined;
  Projects: undefined;
  Menu: undefined;
  IdeaGenerator: undefined;
  IdeaResults: { ideaJobId: string };
  ImageGenerator: { continueFromJobId?: string } | undefined;
  ImageResult: { imageJobId: string };
};
