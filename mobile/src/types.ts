export type ClipScore = {
  hook: number;
  retention: number;
  emotion: number;
  clarity: number;
  shareability: number;
  cta: number;
};

export type ClipStatus = 'pending' | 'rendering' | 'done' | 'failed';

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

export type RootStackParamList = {
  Upload: undefined;
  Processing: { jobId: string };
  Results: { jobId: string };
  Preview: { clip: Clip };
};
