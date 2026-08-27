import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { v4 as uuid } from 'uuid';
import { env } from './env.js';
import { createJob, getJob, type Job } from './store.js';
import { processJob } from './pipeline.js';

const app = express();
app.use(cors());

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

app.use('/files', express.static(path.join(env.storageDir, 'clips')));

app.listen(env.port, () => {
  console.log(`Server listening on http://localhost:${env.port}`);
});
