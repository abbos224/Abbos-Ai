import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { v4 as uuid } from 'uuid';
import { env } from './env.js';
import { createJob, getJob, updateClip, type Job, type Translation } from './store.js';
import { processJob } from './pipeline.js';
import { renderTranslation } from './videoPipeline.js';
import { SUPPORTED_LANGUAGES } from './translate.js';

const app = express();
app.use(cors());
app.use(express.json());

const uploadsDir = path.join(env.storageDir, 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadsDir,
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname) || '.mp4';
      cb(null, `${uuid()}${ext}`);
    },
  }),
  limits: { fileSize: 2 * 1024 * 1024 * 1024 }, // 2GB
});

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/upload', upload.single('video'), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'No video file uploaded (field name: "video")' });
    return;
  }

  const jobId = uuid();
  const job: Job = {
    id: jobId,
    originalFilename: req.file.originalname,
    sourceFile: req.file.path,
    status: 'uploaded',
    createdAt: new Date().toISOString(),
    clips: [],
  };
  createJob(job);

  processJob(jobId).catch((err) => {
    console.error(`Job ${jobId} crashed:`, err);
  });

  res.json({ jobId });
});

app.get('/jobs/:id', (req, res) => {
  const job = getJob(req.params.id);
  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }
  res.json(job);
});

app.get('/languages', (_req, res) => {
  res.json(SUPPORTED_LANGUAGES);
});

app.post('/jobs/:jobId/clips/:clipId/translate', async (req, res) => {
  const { jobId, clipId } = req.params;
  const { language } = req.body as { language?: string };
  if (!language) {
    res.status(400).json({ error: 'Missing "language" in request body' });
    return;
  }

  const job = getJob(jobId);
  const clip = job?.clips.find((c) => c.id === clipId);
  if (!job || !clip) {
    res.status(404).json({ error: 'Job or clip not found' });
    return;
  }
  if (clip.status !== 'done') {
    res.status(400).json({ error: 'Clip has not finished rendering yet' });
    return;
  }

  const languageLabel = SUPPORTED_LANGUAGES.find((l) => l.code === language)?.label ?? language;
  const translationId = uuid();
  const pending: Translation = { id: translationId, language, languageLabel, hook: '', status: 'rendering' };
  updateClip(jobId, clipId, { translations: [...(clip.translations ?? []), pending] });

  const settle = (patch: Partial<Translation>) => {
    const current = getJob(jobId)?.clips.find((c) => c.id === clipId);
    if (!current) return;
    updateClip(jobId, clipId, {
      translations: (current.translations ?? []).map((t) => (t.id === translationId ? { ...t, ...patch } : t)),
    });
  };

  try {
    const { outputFile, hook } = await renderTranslation(clip, language);
    settle({ status: 'done', outputFile, hook });
    res.json({ translationId, status: 'done', outputFile, hook });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    settle({ status: 'failed', error: message });
    res.status(500).json({ error: message });
  }
});

app.use('/files', express.static(path.join(env.storageDir, 'clips')));

app.listen(env.port, () => {
  console.log(`Server listening on http://localhost:${env.port}`);
});
