import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { v4 as uuid } from 'uuid';
import { env } from './env.js';
import { createJob, getJob, listAllJobs, updateClip, type Job, type Translation } from './store.js';
import { processJob } from './pipeline.js';
import { renderTranslation } from './videoPipeline.js';
import { SUPPORTED_LANGUAGES } from './translate.js';
import { getBrandKit, updateBrandKit } from './brandKit.js';
import { CAPTION_STYLES } from './ass.js';
import { getScheduledClips, getUnscheduledDoneClips, suggestScheduleDates } from './calendar.js';
import { getActivePersona, isPersonaName, listPersonas, setActivePersona } from './personas.js';

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

const brandDir = path.join(env.storageDir, 'brand');
fs.mkdirSync(brandDir, { recursive: true });

const uploadLogo = multer({
  storage: multer.diskStorage({
    destination: brandDir,
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname) || '.png';
      cb(null, `logo${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB — a logo, not a video
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

app.get('/caption-styles', (_req, res) => {
  res.json(CAPTION_STYLES);
});

app.get('/brand-kit', (_req, res) => {
  const kit = getBrandKit();
  res.json({
    logoUrl: kit.logoFile ? `/brand-assets/${path.basename(kit.logoFile)}` : undefined,
    accentColor: kit.accentColor,
    captionStyle: kit.captionStyle,
  });
});

app.put('/brand-kit', (req, res) => {
  const { accentColor, captionStyle } = req.body as { accentColor?: string; captionStyle?: string };

  if (accentColor !== undefined && !/^#[0-9a-fA-F]{6}$/.test(accentColor)) {
    res.status(400).json({ error: 'accentColor must be a hex color like "#1F3A5F"' });
    return;
  }
  if (captionStyle !== undefined && !CAPTION_STYLES.includes(captionStyle as (typeof CAPTION_STYLES)[number])) {
    res.status(400).json({ error: `captionStyle must be one of: ${CAPTION_STYLES.join(', ')}` });
    return;
  }

  // Only patch the fields actually sent, so setting one doesn't wipe out the other.
  const patch: { accentColor?: string; captionStyle?: (typeof CAPTION_STYLES)[number] } = {};
  if (accentColor !== undefined) patch.accentColor = accentColor;
  if (captionStyle !== undefined) patch.captionStyle = captionStyle as (typeof CAPTION_STYLES)[number];

  const kit = updateBrandKit(patch);
  res.json({ accentColor: kit.accentColor, captionStyle: kit.captionStyle });
});

app.post('/brand-kit/logo', uploadLogo.single('logo'), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'No logo file uploaded (field name: "logo")' });
    return;
  }
  const kit = updateBrandKit({ logoFile: `brand/${req.file.filename}` });
  res.json({ logoUrl: `/brand-assets/${req.file.filename}` });
});

app.use('/brand-assets', express.static(brandDir));

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

app.put('/jobs/:jobId/clips/:clipId/schedule', (req, res) => {
  const { jobId, clipId } = req.params;
  const { scheduledFor } = req.body as { scheduledFor?: string | null };

  const job = getJob(jobId);
  const clip = job?.clips.find((c) => c.id === clipId);
  if (!job || !clip) {
    res.status(404).json({ error: 'Job or clip not found' });
    return;
  }

  if (scheduledFor != null && !/^\d{4}-\d{2}-\d{2}$/.test(scheduledFor)) {
    res.status(400).json({ error: 'scheduledFor must be an ISO date (yyyy-mm-dd) or null' });
    return;
  }

  updateClip(jobId, clipId, { scheduledFor: scheduledFor ?? undefined });
  res.json({ ok: true, scheduledFor: scheduledFor ?? null });
});

app.get('/calendar', (_req, res) => {
  const entries = getScheduledClips(listAllJobs());
  res.json(
    entries.map(({ jobId, clip }) => ({
      jobId,
      clipId: clip.id,
      scheduledFor: clip.scheduledFor,
      topic: clip.topic,
      chosenHook: clip.chosenHook,
      outputFile: clip.outputFile,
    }))
  );
});

app.post('/calendar/auto-schedule', (req, res) => {
  const { intervalDays } = (req.body ?? {}) as { intervalDays?: number };
  const interval = intervalDays && intervalDays > 0 ? intervalDays : 2;

  const candidates = getUnscheduledDoneClips(listAllJobs());
  const dates = suggestScheduleDates(candidates.length, interval, new Date());

  candidates.forEach((entry, i) => {
    updateClip(entry.jobId, entry.clip.id, { scheduledFor: dates[i] });
  });

  res.json(
    candidates.map((entry, i) => ({
      jobId: entry.jobId,
      clipId: entry.clip.id,
      scheduledFor: dates[i],
    }))
  );
});

app.get('/personas', (_req, res) => {
  res.json({ personas: listPersonas(), activePersona: getActivePersona() ?? null });
});

app.put('/personas/active', (req, res) => {
  const { persona } = req.body as { persona?: string | null };

  if (persona != null && !isPersonaName(persona)) {
    res.status(400).json({ error: `persona must be one of: ${listPersonas().map((p) => p.name).join(', ')}, or null` });
    return;
  }

  const activePersona = setActivePersona(persona ?? null);
  res.json({ activePersona: activePersona ?? null });
});

app.use('/files', express.static(path.join(env.storageDir, 'clips')));

app.listen(env.port, () => {
  console.log(`Server listening on http://localhost:${env.port}`);
});
