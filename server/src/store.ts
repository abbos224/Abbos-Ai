import fs from 'node:fs';
import path from 'node:path';
import { env } from './env.js';

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
  language: string; // BCP-47-ish code, e.g. 'ru', 'ar', 'es'
  languageLabel: string; // human-readable, e.g. 'Russian'
  hook: string;
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
  hookOptions: string[];
  chosenHook: string;
  cta: string;
  coverOptions: string[];
  coverImages?: string[]; // rendered cover image URLs, same order as coverOptions
  socialCaption?: SocialCaption; // post caption/hashtags/keywords for manual posting to IG/TikTok
  status: ClipStatus;
  outputFile?: string;
  error?: string;
  translations?: Translation[];
  scheduledFor?: string; // ISO date (yyyy-mm-dd), when the user plans to post this clip
  publishedYoutubeUrl?: string; // set once this clip has been uploaded to YouTube
};

export type JobStatus =
  | 'uploaded'
  | 'transcribing'
  | 'analyzing'
  | 'rendering'
  | 'done'
  | 'failed';

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

type DB = { jobs: Record<string, Job> };

const dbPath = path.join(env.storageDir, 'db.json');

function readDb(): DB {
  if (!fs.existsSync(dbPath)) return { jobs: {} };
  return JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
}

function writeDb(db: DB) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
}

export function createJob(job: Job) {
  const db = readDb();
  db.jobs[job.id] = job;
  writeDb(db);
}

export function getJob(id: string): Job | undefined {
  return readDb().jobs[id];
}

export function listAllJobs(): Job[] {
  return Object.values(readDb().jobs);
}

export function updateJob(id: string, patch: Partial<Job>) {
  const db = readDb();
  const job = db.jobs[id];
  if (!job) throw new Error(`Job not found: ${id}`);
  db.jobs[id] = { ...job, ...patch };
  writeDb(db);
}

export function setClips(jobId: string, clips: Clip[]) {
  updateJob(jobId, { clips });
}

export function updateClip(jobId: string, clipId: string, patch: Partial<Clip>) {
  const db = readDb();
  const job = db.jobs[jobId];
  if (!job) throw new Error(`Job not found: ${jobId}`);
  job.clips = job.clips.map((c) => (c.id === clipId ? { ...c, ...patch } : c));
  db.jobs[jobId] = job;
  writeDb(db);
}
