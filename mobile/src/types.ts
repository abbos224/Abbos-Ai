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

export type Clip = {
  id: string;
  jobId: string;
  startTime: number;
  endTime: number;
  topic: string;
  score: number;
  scoreBreakdown: ClipScore;
  hookOptions: string[];
  chosenHook: string;
  status: ClipStatus;
  outputFile?: string;
  error?: string;
  translations?: Translation[];
  scheduledFor?: string;
};

export type CalendarEntry = {
  jobId: string;
  clipId: string;
  scheduledFor: string;
  topic: string;
  chosenHook: string;
  outputFile?: string;
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

export type BrandKit = { logoUrl?: string; accentColor?: string; captionStyle?: CaptionStyleName };

export type RootStackParamList = {
  Upload: undefined;
  Processing: { jobId: string };
  Results: { jobId: string };
  Preview: { clip: Clip };
  BrandKit: undefined;
  Calendar: undefined;
};
