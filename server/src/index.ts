import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { v4 as uuid } from 'uuid';
import { env } from './env.js';
import { createJob, getJob, listAllJobs, updateClip, type Job, type Regeneration, type Translation } from './store.js';
import { processJob } from './pipeline.js';
import { renderTranslation, renderRegeneration } from './videoPipeline.js';
import { SUPPORTED_LANGUAGES } from './translate.js';
import { getModifierLabel, isRegenerateModifier, REGENERATE_MODIFIERS } from './regenerate.js';
import { getBrandKit, updateBrandKit } from './brandKit.js';
import { CAPTION_STYLES } from './ass.js';
import { SOUND_EFFECTS_STYLES, isSoundEffectsStyle, type SoundEffectsStyle } from './soundEffects.js';
import { getScheduledClips, getUnscheduledDoneClips, suggestScheduleDates } from './calendar.js';
import { getActivePersona, isPersonaName, listPersonas, setActivePersona } from './personas.js';
import * as youtube from './youtube.js';
import * as google from './google.js';
import { getPublishedClips } from './analytics.js';
import { runMigrations } from './db.js';
import {
  registerUser,
  loginUser,
  signToken,
  getUserById,
  AuthError,
  signOAuthState,
  verifyOAuthState,
  findOrCreateGoogleUser,
  signGoogleState,
  verifyGoogleState,
} from './auth.js';
import { requireAuth } from './authMiddleware.js';
import { createIdeaJob, getIdeaJob, listIdeaJobs, type IdeaJob } from './ideaStore.js';
import { processIdeaJob } from './ideaPipeline.js';

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
    // One logo per user, named by userId so accounts can't collide or overwrite each other —
    // requireAuth runs before this middleware, so req.userId is already set.
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname) || '.png';
      cb(null, `${req.userId}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB — a logo, not a video
});

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/upload', requireAuth, upload.single('video'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'No video file uploaded (field name: "video")' });
    return;
  }

  const userId = req.userId!;
  const jobId = uuid();
  const job: Job = {
    id: jobId,
    originalFilename: req.file.originalname,
    sourceFile: req.file.path,
    status: 'uploaded',
    createdAt: new Date().toISOString(),
    clips: [],
  };
  await createJob(userId, job);

  processJob(userId, jobId).catch((err) => {
    console.error(`Job ${jobId} crashed:`, err);
  });

  res.json({ jobId });
});

app.get('/jobs', requireAuth, async (req, res) => {
  const jobs = await listAllJobs(req.userId!);
  res.json(
    jobs.map((job) => ({
      id: job.id,
      originalFilename: job.originalFilename,
      status: job.status,
      createdAt: job.createdAt,
      clipCount: job.clips.length,
    }))
  );
});

app.get('/jobs/:id', requireAuth, async (req, res) => {
  const job = await getJob(req.userId!, req.params.id as string);
  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }
  res.json(job);
});

const MAX_TOPIC_LENGTH = 200;

app.post('/ideas', requireAuth, async (req, res) => {
  const userId = req.userId!;
  const { topic } = req.body as { topic?: string };
  const trimmed = topic?.trim();
  if (!trimmed) {
    res.status(400).json({ error: 'Missing "topic" in request body' });
    return;
  }
  if (trimmed.length > MAX_TOPIC_LENGTH) {
    res.status(400).json({ error: `"topic" must be ${MAX_TOPIC_LENGTH} characters or fewer` });
    return;
  }

  const ideaJobId = uuid();
  const ideaJob: IdeaJob = {
    id: ideaJobId,
    topic: trimmed,
    status: 'generating',
    createdAt: new Date().toISOString(),
    ideas: [],
  };
  await createIdeaJob(userId, ideaJob);

  processIdeaJob(userId, ideaJobId, trimmed).catch((err) => {
    console.error(`Idea job ${ideaJobId} crashed:`, err);
  });

  res.json({ ideaJobId });
});

app.get('/ideas', requireAuth, async (req, res) => {
  const ideaJobs = await listIdeaJobs(req.userId!);
  res.json(
    ideaJobs.map((job) => ({
      id: job.id,
      topic: job.topic,
      status: job.status,
      createdAt: job.createdAt,
      ideaCount: job.ideas.length,
    }))
  );
});

app.get('/ideas/:id', requireAuth, async (req, res) => {
  const ideaJob = await getIdeaJob(req.userId!, req.params.id as string);
  if (!ideaJob) {
    res.status(404).json({ error: 'Idea job not found' });
    return;
  }
  res.json(ideaJob);
});

app.get('/languages', (_req, res) => {
  res.json(SUPPORTED_LANGUAGES);
});

app.get('/caption-styles', (_req, res) => {
  res.json(CAPTION_STYLES);
});

app.get('/sound-effects-styles', (_req, res) => {
  res.json(SOUND_EFFECTS_STYLES);
});

app.get('/brand-kit', requireAuth, async (req, res) => {
  const kit = await getBrandKit(req.userId!);
  res.json({
    logoUrl: kit.logoFile ? `/brand-assets/${path.basename(kit.logoFile)}` : undefined,
    accentColor: kit.accentColor,
    captionStyle: kit.captionStyle,
    soundEffectsStyle: kit.soundEffectsStyle,
  });
});

app.put('/brand-kit', requireAuth, async (req, res) => {
  const { accentColor, captionStyle, soundEffectsStyle } = req.body as {
    accentColor?: string;
    captionStyle?: string;
    soundEffectsStyle?: string;
  };

  if (accentColor !== undefined && !/^#[0-9a-fA-F]{6}$/.test(accentColor)) {
    res.status(400).json({ error: 'accentColor must be a hex color like "#1F3A5F"' });
    return;
  }
  if (captionStyle !== undefined && !CAPTION_STYLES.includes(captionStyle as (typeof CAPTION_STYLES)[number])) {
    res.status(400).json({ error: `captionStyle must be one of: ${CAPTION_STYLES.join(', ')}` });
    return;
  }
  if (soundEffectsStyle !== undefined && !isSoundEffectsStyle(soundEffectsStyle)) {
    res.status(400).json({ error: `soundEffectsStyle must be one of: ${SOUND_EFFECTS_STYLES.join(', ')}` });
    return;
  }

  // Only patch the fields actually sent, so setting one doesn't wipe out the others.
  const patch: {
    accentColor?: string;
    captionStyle?: (typeof CAPTION_STYLES)[number];
    soundEffectsStyle?: SoundEffectsStyle;
  } = {};
  if (accentColor !== undefined) patch.accentColor = accentColor;
  if (captionStyle !== undefined) patch.captionStyle = captionStyle as (typeof CAPTION_STYLES)[number];
  if (soundEffectsStyle !== undefined) patch.soundEffectsStyle = soundEffectsStyle;

  const kit = await updateBrandKit(req.userId!, patch);
  res.json({ accentColor: kit.accentColor, captionStyle: kit.captionStyle, soundEffectsStyle: kit.soundEffectsStyle });
});

app.post('/brand-kit/logo', requireAuth, uploadLogo.single('logo'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'No logo file uploaded (field name: "logo")' });
    return;
  }
  const kit = await updateBrandKit(req.userId!, { logoFile: `brand/${req.file.filename}` });
  res.json({ logoUrl: `/brand-assets/${req.file.filename}` });
});

app.use('/brand-assets', express.static(brandDir));

app.post('/jobs/:jobId/clips/:clipId/translate', requireAuth, async (req, res) => {
  const userId = req.userId!;
  const { jobId, clipId } = req.params as { jobId: string; clipId: string };
  const { language } = req.body as { language?: string };
  if (!language) {
    res.status(400).json({ error: 'Missing "language" in request body' });
    return;
  }

  const job = await getJob(userId, jobId);
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
  await updateClip(userId, jobId, clipId, { translations: [...(clip.translations ?? []), pending] });

  const settle = async (patch: Partial<Translation>) => {
    const current = (await getJob(userId, jobId))?.clips.find((c) => c.id === clipId);
    if (!current) return;
    await updateClip(userId, jobId, clipId, {
      translations: (current.translations ?? []).map((t) => (t.id === translationId ? { ...t, ...patch } : t)),
    });
  };

  try {
    const { outputFile, hook } = await renderTranslation(userId, clip, language);
    await settle({ status: 'done', outputFile, hook });
    res.json({ translationId, status: 'done', outputFile, hook });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await settle({ status: 'failed', error: message });
    res.status(500).json({ error: message });
  }
});

app.get('/regenerate-modifiers', (_req, res) => {
  res.json(REGENERATE_MODIFIERS.map((m) => ({ modifier: m, label: getModifierLabel(m) })));
});

app.post('/jobs/:jobId/clips/:clipId/regenerate', requireAuth, async (req, res) => {
  const userId = req.userId!;
  const { jobId, clipId } = req.params as { jobId: string; clipId: string };
  const { modifier } = req.body as { modifier?: string };
  if (!modifier || !isRegenerateModifier(modifier)) {
    res.status(400).json({ error: `modifier must be one of: ${REGENERATE_MODIFIERS.join(', ')}` });
    return;
  }

  const job = await getJob(userId, jobId);
  const clip = job?.clips.find((c) => c.id === clipId);
  if (!job || !clip) {
    res.status(404).json({ error: 'Job or clip not found' });
    return;
  }
  if (clip.status !== 'done') {
    res.status(400).json({ error: 'Clip has not finished rendering yet' });
    return;
  }

  const regenerationId = uuid();
  const pending: Regeneration = {
    id: regenerationId,
    modifier,
    modifierLabel: getModifierLabel(modifier),
    hookOptions: [],
    chosenHook: '',
    cta: '',
    coverOptions: [],
    status: 'rendering',
  };
  await updateClip(userId, jobId, clipId, { regenerations: [...(clip.regenerations ?? []), pending] });

  const settle = async (patch: Partial<Regeneration>) => {
    const current = (await getJob(userId, jobId))?.clips.find((c) => c.id === clipId);
    if (!current) return;
    await updateClip(userId, jobId, clipId, {
      regenerations: (current.regenerations ?? []).map((r) => (r.id === regenerationId ? { ...r, ...patch } : r)),
    });
  };

  try {
    const { outputFile, coverImages, hookOptions, chosenHook, cta, socialCaption } = await renderRegeneration(
      userId,
      clip,
      modifier,
    );
    await settle({ status: 'done', outputFile, coverImages, hookOptions, chosenHook, cta, socialCaption });
    res.json({ regenerationId, status: 'done', outputFile, coverImages, hookOptions, chosenHook, cta, socialCaption });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await settle({ status: 'failed', error: message });
    res.status(500).json({ error: message });
  }
});

app.put('/jobs/:jobId/clips/:clipId/schedule', requireAuth, async (req, res) => {
  const userId = req.userId!;
  const { jobId, clipId } = req.params as { jobId: string; clipId: string };
  const { scheduledFor } = req.body as { scheduledFor?: string | null };

  const job = await getJob(userId, jobId);
  const clip = job?.clips.find((c) => c.id === clipId);
  if (!job || !clip) {
    res.status(404).json({ error: 'Job or clip not found' });
    return;
  }

  if (scheduledFor != null && !/^\d{4}-\d{2}-\d{2}$/.test(scheduledFor)) {
    res.status(400).json({ error: 'scheduledFor must be an ISO date (yyyy-mm-dd) or null' });
    return;
  }

  await updateClip(userId, jobId, clipId, { scheduledFor: scheduledFor ?? undefined });
  res.json({ ok: true, scheduledFor: scheduledFor ?? null });
});

app.get('/calendar', requireAuth, async (req, res) => {
  const entries = getScheduledClips(await listAllJobs(req.userId!));
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

app.post('/calendar/auto-schedule', requireAuth, async (req, res) => {
  const userId = req.userId!;
  const { intervalDays } = (req.body ?? {}) as { intervalDays?: number };
  const interval = intervalDays && intervalDays > 0 ? intervalDays : 2;

  const candidates = getUnscheduledDoneClips(await listAllJobs(userId));
  const dates = suggestScheduleDates(candidates.length, interval, new Date());

  // Sequential, not Promise.all: several candidates can share the same job, and updateClip does a
  // read-modify-write of the whole job row — concurrent writes to the same row would race and
  // silently drop one clip's schedule.
  for (let i = 0; i < candidates.length; i++) {
    await updateClip(userId, candidates[i].jobId, candidates[i].clip.id, { scheduledFor: dates[i] });
  }

  res.json(
    candidates.map((entry, i) => ({
      jobId: entry.jobId,
      clipId: entry.clip.id,
      scheduledFor: dates[i],
    }))
  );
});

app.get('/personas', requireAuth, async (req, res) => {
  const activePersona = await getActivePersona(req.userId!);
  res.json({ personas: listPersonas(), activePersona: activePersona ?? null });
});

app.put('/personas/active', requireAuth, async (req, res) => {
  const { persona } = req.body as { persona?: string | null };

  if (persona != null && !isPersonaName(persona)) {
    res.status(400).json({ error: `persona must be one of: ${listPersonas().map((p) => p.name).join(', ')}, or null` });
    return;
  }

  const activePersona = await setActivePersona(req.userId!, persona ?? null);
  res.json({ activePersona: activePersona ?? null });
});

app.get('/youtube/status', requireAuth, async (req, res) => {
  res.json({ configured: youtube.isConfigured(), ...(await youtube.getConnectionStatus(req.userId!)) });
});

// "Connect YouTube" opens a real external browser (Google disallows in-app WebView OAuth), so
// /oauth/youtube/start and the Google redirect back to /oauth/youtube/callback can't carry our
// normal Authorization header. The mobile app first calls this authenticated endpoint to get a
// short-lived, purpose-scoped state token (see auth.ts's signOAuthState), then opens
// /oauth/youtube/start?state=<token> in the browser — Google echoes that same state back
// unchanged on the callback, which is how the callback recovers which account to attach the
// connection to without any server-side session storage for the handshake.
app.get('/oauth/youtube/connect-state', requireAuth, (req, res) => {
  res.json({ state: signOAuthState(req.userId!) });
});

app.get('/oauth/youtube/start', (req, res) => {
  if (!youtube.isConfigured()) {
    res.status(400).send('YouTube is not configured on the server (missing YOUTUBE_CLIENT_ID/SECRET).');
    return;
  }
  const { state } = req.query as { state?: string };
  if (!state) {
    res.status(400).send('Missing or expired connection request — go back to the app and try connecting again.');
    return;
  }
  try {
    verifyOAuthState(state); // fails fast on a missing/expired/garbage state before ever hitting Google
  } catch {
    res.status(400).send('Missing or expired connection request — go back to the app and try connecting again.');
    return;
  }
  res.redirect(youtube.getAuthUrl(state));
});

app.get('/oauth/youtube/callback', async (req, res) => {
  const { code, error, state } = req.query as { code?: string; error?: string; state?: string };
  if (error) {
    res.status(400).send(`YouTube connection was not granted: ${error}`);
    return;
  }
  if (!code || !state) {
    res.status(400).send('Missing "code" or "state" from Google redirect.');
    return;
  }

  let userId: string;
  try {
    userId = verifyOAuthState(state);
  } catch {
    res.status(400).send('This connection request has expired — go back to the app and try connecting again.');
    return;
  }

  try {
    await youtube.completeAuth(userId, code);
    res.send('<html><body style="font-family:sans-serif;padding:40px"><h2>YouTube connected ✅</h2><p>You can close this tab and go back to the app.</p></body></html>');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).send(`YouTube connection failed: ${message}`);
  }
});

app.post('/youtube/disconnect', requireAuth, async (req, res) => {
  await youtube.disconnect(req.userId!);
  res.json({ connected: false });
});

app.post('/jobs/:jobId/clips/:clipId/publish/youtube', requireAuth, async (req, res) => {
  const userId = req.userId!;
  const { jobId, clipId } = req.params as { jobId: string; clipId: string };
  const { title, description, privacyStatus } = req.body as {
    title?: string;
    description?: string;
    privacyStatus?: youtube.PrivacyStatus;
  };

  const job = await getJob(userId, jobId);
  const clip = job?.clips.find((c) => c.id === clipId);
  if (!job || !clip) {
    res.status(404).json({ error: 'Job or clip not found' });
    return;
  }
  if (clip.status !== 'done' || !clip.outputFile) {
    res.status(400).json({ error: 'Clip has not finished rendering yet' });
    return;
  }
  if (!(await youtube.getConnectionStatus(userId)).connected) {
    res.status(400).json({ error: 'YouTube is not connected. Visit /oauth/youtube/start first.' });
    return;
  }

  const localPath = path.join(env.storageDir, 'clips', clip.outputFile.replace(/^\/files\//, ''));
  if (!fs.existsSync(localPath)) {
    res.status(404).json({ error: 'Rendered video file not found on disk' });
    return;
  }

  try {
    const { videoId, url } = await youtube.uploadVideo(
      userId,
      localPath,
      title || clip.chosenHook || clip.topic,
      description || clip.cta || '',
      privacyStatus ?? 'private',
    );
    await updateClip(userId, jobId, clipId, { publishedYoutubeUrl: url });
    res.json({ videoId, url });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.get('/analytics/youtube', requireAuth, async (req, res) => {
  const userId = req.userId!;
  if (!(await youtube.getConnectionStatus(userId)).connected) {
    res.status(400).json({ error: 'YouTube is not connected. Visit /oauth/youtube/start first.' });
    return;
  }

  const entries = getPublishedClips(await listAllJobs(userId));
  if (entries.length === 0) {
    res.json([]);
    return;
  }

  try {
    const stats = await youtube.getVideoStats(userId, entries.map((e) => e.videoId));
    const statsByVideoId = new Map(stats.map((s) => [s.videoId, s]));

    res.json(
      entries.map((entry) => {
        const s = statsByVideoId.get(entry.videoId);
        return {
          jobId: entry.jobId,
          clipId: entry.clip.id,
          topic: entry.clip.topic,
          chosenHook: entry.clip.chosenHook,
          url: entry.clip.publishedYoutubeUrl,
          viewCount: s?.viewCount ?? 0,
          likeCount: s?.likeCount ?? 0,
          commentCount: s?.commentCount ?? 0,
        };
      })
    );
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.use('/files', express.static(path.join(env.storageDir, 'clips')));

// --- Auth (foundation only — not yet required by any route above; see project plan) ---

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

app.post('/auth/register', async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !isValidEmail(email)) {
    res.status(400).json({ error: 'A valid email is required' });
    return;
  }
  if (!password || password.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters' });
    return;
  }

  try {
    const user = await registerUser(email, password);
    res.json({ token: signToken(user.id), user });
  } catch (err) {
    if (err instanceof AuthError) {
      res.status(409).json({ error: err.message });
      return;
    }
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required' });
    return;
  }

  try {
    const user = await loginUser(email, password);
    res.json({ token: signToken(user.id), user });
  } catch (err) {
    if (err instanceof AuthError) {
      res.status(401).json({ error: err.message });
      return;
    }
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.get('/auth/me', requireAuth, async (req, res) => {
  const user = await getUserById(req.userId!);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.json({ user });
});

// --- Google sign-in ---
//
// Unlike the "Connect YouTube" flow (which attaches a third-party grant to an *already logged-in*
// account via a userId-carrying state token), Google sign-in has no session at all when it
// starts — that's the whole point of the button. Expo Go can't register a native URL scheme for
// Google to redirect into directly (no custom dev client here), so the server plays the role of
// the actual OAuth client: it owns a real redirect_uri, and the mobile app's own exp:// deep link
// (computed via expo-linking) rides through as the `returnTo` in a signed state instead of a
// userId. The callback mints the same session JWT /auth/register and /auth/login already
// produce, then hands it back via a tap-through link into that exp:// URL.

app.get('/oauth/google/start', (req, res) => {
  if (!google.isConfigured()) {
    res.status(400).send('Google sign-in is not configured on the server (missing GOOGLE_CLIENT_ID/SECRET).');
    return;
  }
  const { returnTo } = req.query as { returnTo?: string };
  // returnTo is client-supplied on this unauthenticated route — restricted to exp:// so this
  // can't be turned into an open redirect that leaks a freshly-minted session token to an
  // arbitrary URL.
  if (!returnTo || !returnTo.startsWith('exp://')) {
    res.status(400).send('Missing or invalid return address.');
    return;
  }
  res.redirect(google.getAuthUrl(signGoogleState(returnTo)));
});

app.get('/oauth/google/callback', async (req, res) => {
  const { code, error, state } = req.query as { code?: string; error?: string; state?: string };
  if (error) {
    res.status(400).send(`Google sign-in was not granted: ${error}`);
    return;
  }
  if (!code || !state) {
    res.status(400).send('Missing "code" or "state" from Google redirect.');
    return;
  }

  let returnTo: string;
  try {
    returnTo = verifyGoogleState(state);
  } catch {
    res.status(400).send('This sign-in request has expired — go back to the app and try again.');
    return;
  }

  try {
    const identity = await google.completeAuth(code);
    const user = await findOrCreateGoogleUser(identity.googleId, identity.email);
    const token = signToken(user.id);
    const returnUrl = `${returnTo}?token=${encodeURIComponent(token)}`;
    // Auto-navigate to the exp:// deep link immediately — no extra tap needed. The visible link
    // stays as a fallback for the rare case a browser blocks a script-initiated navigation to a
    // custom URL scheme (iOS Safari still shows its own "Open in Expo Go?" confirmation either
    // way; that native prompt is expected, not a bug in this page).
    res.send(
      `<html><body style="font-family:sans-serif;padding:40px">` +
        `<h2>Signed in ✅</h2>` +
        `<p><a href="${returnUrl}" id="return-link">Tap here to return to MrAiBos</a></p>` +
        `<script>window.location.replace(${JSON.stringify(returnUrl)});</script>` +
        `</body></html>`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).send(`Google sign-in failed: ${message}`);
  }
});

// Postgres is no longer auth-only: jobs/clips now live there too, so a missing/unreachable
// database breaks the core upload/job flow, not just /auth/*. Still not a startup crash — a
// missing DATABASE_URL is a broken deployment, not a reason to take the whole process down before
// it can even report a clear error per-request.
async function start() {
  if (env.databaseUrl) {
    try {
      await runMigrations();
    } catch (err) {
      console.error('[db] Postgres migration failed — auth and job storage will not work:', err);
    }
  } else {
    console.log('[db] DATABASE_URL not set — auth and job storage will not work until it is configured.');
  }

  app.listen(env.port, () => {
    console.log(`Server listening on http://localhost:${env.port}`);
  });
}

start();
