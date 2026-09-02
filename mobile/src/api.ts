import { API_BASE_URL } from './config';
import { getToken } from './authStorage';
import type {
  AnalyticsEntry,
  AuthUser,
  BrandKit,
  CalendarEntry,
  CaptionStyleName,
  IdeaJob,
  IdeaJobSummary,
  Job,
  JobSummary,
  Language,
  Persona,
  PersonaName,
  Regeneration,
  RegenerateModifier,
  SoundEffectsStyle,
  Translation,
  YoutubeStatus,
} from './types';

// Jobs/clips (and the routes derived from them — translate, regenerate, schedule, calendar,
// YouTube publish/analytics) require a logged-in user server-side; every other function below
// still hits an anonymous route and is untouched.
async function authFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = await getToken();
  return fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: { ...options.headers, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
}

export async function uploadVideo(uri: string, fileName: string): Promise<{ jobId: string }> {
  const form = new FormData();
  // React Native's FormData accepts this {uri, name, type} shape for file fields.
  form.append('video', {
    uri,
    name: fileName,
    type: 'video/mp4',
  } as unknown as Blob);

  const res = await authFetch('/upload', {
    method: 'POST',
    body: form,
    headers: { 'Content-Type': 'multipart/form-data' },
  });

  if (!res.ok) {
    throw new Error(`Upload failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

export async function getAllJobs(): Promise<JobSummary[]> {
  const res = await authFetch('/jobs');
  if (!res.ok) {
    throw new Error(`Failed to fetch jobs: ${res.status}`);
  }
  return res.json();
}

export async function getJob(jobId: string): Promise<Job> {
  const res = await authFetch(`/jobs/${jobId}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch job: ${res.status}`);
  }
  return res.json();
}

export async function generateIdeas(topic: string): Promise<{ ideaJobId: string }> {
  const res = await authFetch('/ideas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic }),
  });
  if (!res.ok) {
    throw new Error(`Failed to start idea generation: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

export async function getAllIdeaJobs(): Promise<IdeaJobSummary[]> {
  const res = await authFetch('/ideas');
  if (!res.ok) {
    throw new Error(`Failed to fetch ideas: ${res.status}`);
  }
  return res.json();
}

export async function getIdeaJob(ideaJobId: string): Promise<IdeaJob> {
  const res = await authFetch(`/ideas/${ideaJobId}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch idea job: ${res.status}`);
  }
  return res.json();
}

export function clipFileUrl(outputFile: string): string {
  return `${API_BASE_URL}${outputFile}`;
}

export async function getLanguages(): Promise<Language[]> {
  const res = await fetch(`${API_BASE_URL}/languages`);
  if (!res.ok) {
    throw new Error(`Failed to fetch languages: ${res.status}`);
  }
  return res.json();
}

export async function translateClip(
  jobId: string,
  clipId: string,
  language: string,
): Promise<Translation> {
  const res = await authFetch(`/jobs/${jobId}/clips/${clipId}/translate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ language }),
  });

  if (!res.ok) {
    throw new Error(`Translation failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

export async function getBrandKit(): Promise<BrandKit> {
  const res = await authFetch('/brand-kit');
  if (!res.ok) {
    throw new Error(`Failed to fetch brand kit: ${res.status}`);
  }
  return res.json();
}

export async function setBrandAccentColor(accentColor: string): Promise<BrandKit> {
  const res = await authFetch('/brand-kit', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accentColor }),
  });
  if (!res.ok) {
    throw new Error(`Failed to save accent color: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

export async function getCaptionStyles(): Promise<CaptionStyleName[]> {
  const res = await fetch(`${API_BASE_URL}/caption-styles`);
  if (!res.ok) {
    throw new Error(`Failed to fetch caption styles: ${res.status}`);
  }
  return res.json();
}

export async function setCaptionStyle(captionStyle: CaptionStyleName): Promise<BrandKit> {
  const res = await authFetch('/brand-kit', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ captionStyle }),
  });
  if (!res.ok) {
    throw new Error(`Failed to save caption style: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

export async function getSoundEffectsStyles(): Promise<SoundEffectsStyle[]> {
  const res = await fetch(`${API_BASE_URL}/sound-effects-styles`);
  if (!res.ok) {
    throw new Error(`Failed to fetch sound effects styles: ${res.status}`);
  }
  return res.json();
}

export async function setSoundEffectsStyle(soundEffectsStyle: SoundEffectsStyle): Promise<BrandKit> {
  const res = await authFetch('/brand-kit', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ soundEffectsStyle }),
  });
  if (!res.ok) {
    throw new Error(`Failed to save sound effects style: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

export async function uploadBrandLogo(uri: string, fileName: string): Promise<BrandKit> {
  const form = new FormData();
  form.append('logo', {
    uri,
    name: fileName,
    type: 'image/png',
  } as unknown as Blob);

  const res = await authFetch('/brand-kit/logo', {
    method: 'POST',
    body: form,
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  if (!res.ok) {
    throw new Error(`Logo upload failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

export async function scheduleClip(
  jobId: string,
  clipId: string,
  scheduledFor: string | null,
): Promise<void> {
  const res = await authFetch(`/jobs/${jobId}/clips/${clipId}/schedule`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scheduledFor }),
  });
  if (!res.ok) {
    throw new Error(`Scheduling failed: ${res.status} ${await res.text()}`);
  }
}

export async function getCalendar(): Promise<CalendarEntry[]> {
  const res = await authFetch('/calendar');
  if (!res.ok) {
    throw new Error(`Failed to fetch calendar: ${res.status}`);
  }
  return res.json();
}

export async function autoScheduleCalendar(intervalDays?: number): Promise<CalendarEntry[]> {
  const res = await authFetch('/calendar/auto-schedule', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(intervalDays ? { intervalDays } : {}),
  });
  if (!res.ok) {
    throw new Error(`Auto-schedule failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

export async function getPersonas(): Promise<{ personas: Persona[]; activePersona: PersonaName | null }> {
  const res = await authFetch('/personas');
  if (!res.ok) {
    throw new Error(`Failed to fetch personas: ${res.status}`);
  }
  return res.json();
}

export async function setActivePersona(persona: PersonaName | null): Promise<{ activePersona: PersonaName | null }> {
  const res = await authFetch('/personas/active', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ persona }),
  });
  if (!res.ok) {
    throw new Error(`Failed to save persona: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

export async function getYoutubeStatus(): Promise<YoutubeStatus> {
  const res = await authFetch('/youtube/status');
  if (!res.ok) {
    throw new Error(`Failed to fetch YouTube status: ${res.status}`);
  }
  return res.json();
}

// "Connect YouTube" opens a real external browser (Google disallows in-app WebView OAuth), so this
// URL can't carry our normal Authorization header. It first fetches a short-lived, purpose-scoped
// state token via an authenticated call, then embeds it in the /oauth/youtube/start URL the app
// opens — see index.ts's /oauth/youtube/connect-state for the other half of this.
export async function youtubeConnectUrl(): Promise<string> {
  const res = await authFetch('/oauth/youtube/connect-state');
  if (!res.ok) {
    throw new Error(`Failed to start YouTube connection: ${res.status}`);
  }
  const { state } = (await res.json()) as { state: string };
  return `${API_BASE_URL}/oauth/youtube/start?state=${encodeURIComponent(state)}`;
}

export async function disconnectYoutube(): Promise<void> {
  const res = await authFetch('/youtube/disconnect', { method: 'POST' });
  if (!res.ok) {
    throw new Error(`Failed to disconnect YouTube: ${res.status}`);
  }
}

export async function publishToYoutube(
  jobId: string,
  clipId: string,
  options: { title?: string; description?: string; privacyStatus?: 'private' | 'unlisted' | 'public' },
): Promise<{ videoId: string; url: string }> {
  const res = await authFetch(`/jobs/${jobId}/clips/${clipId}/publish/youtube`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  });
  if (!res.ok) {
    throw new Error(`Publish failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

export async function getYoutubeAnalytics(): Promise<AnalyticsEntry[]> {
  const res = await authFetch('/analytics/youtube');
  if (!res.ok) {
    throw new Error(`Failed to fetch analytics: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

export async function getRegenerateModifiers(): Promise<Array<{ modifier: RegenerateModifier; label: string }>> {
  const res = await fetch(`${API_BASE_URL}/regenerate-modifiers`);
  if (!res.ok) {
    throw new Error(`Failed to fetch regenerate modifiers: ${res.status}`);
  }
  return res.json();
}

export async function regenerateClip(
  jobId: string,
  clipId: string,
  modifier: RegenerateModifier,
): Promise<Regeneration> {
  const res = await authFetch(`/jobs/${jobId}/clips/${clipId}/regenerate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ modifier }),
  });

  if (!res.ok) {
    throw new Error(`Regenerate failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

export async function registerUser(email: string, password: string): Promise<{ token: string; user: AuthUser }> {
  const res = await fetch(`${API_BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    throw new Error((await res.json().catch(() => null))?.error ?? `Sign up failed: ${res.status}`);
  }
  return res.json();
}

export async function loginUser(email: string, password: string): Promise<{ token: string; user: AuthUser }> {
  const res = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    throw new Error((await res.json().catch(() => null))?.error ?? `Login failed: ${res.status}`);
  }
  return res.json();
}

export async function getCurrentUser(token: string): Promise<AuthUser> {
  const res = await fetch(`${API_BASE_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch current user: ${res.status}`);
  }
  return (await res.json()).user;
}
