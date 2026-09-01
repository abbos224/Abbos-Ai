import { API_BASE_URL } from './config';
import type {
  AnalyticsEntry,
  BrandKit,
  CalendarEntry,
  CaptionStyleName,
  Job,
  Language,
  Persona,
  PersonaName,
  Regeneration,
  RegenerateModifier,
  Translation,
  YoutubeStatus,
} from './types';

export async function uploadVideo(uri: string, fileName: string): Promise<{ jobId: string }> {
  const form = new FormData();
  // React Native's FormData accepts this {uri, name, type} shape for file fields.
  form.append('video', {
    uri,
    name: fileName,
    type: 'video/mp4',
  } as unknown as Blob);

  const res = await fetch(`${API_BASE_URL}/upload`, {
    method: 'POST',
    body: form,
    headers: { 'Content-Type': 'multipart/form-data' },
  });

  if (!res.ok) {
    throw new Error(`Upload failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

export async function getJob(jobId: string): Promise<Job> {
  const res = await fetch(`${API_BASE_URL}/jobs/${jobId}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch job: ${res.status}`);
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
  const res = await fetch(`${API_BASE_URL}/jobs/${jobId}/clips/${clipId}/translate`, {
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
  const res = await fetch(`${API_BASE_URL}/brand-kit`);
  if (!res.ok) {
    throw new Error(`Failed to fetch brand kit: ${res.status}`);
  }
  return res.json();
}

export async function setBrandAccentColor(accentColor: string): Promise<BrandKit> {
  const res = await fetch(`${API_BASE_URL}/brand-kit`, {
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
  const res = await fetch(`${API_BASE_URL}/brand-kit`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ captionStyle }),
  });
  if (!res.ok) {
    throw new Error(`Failed to save caption style: ${res.status} ${await res.text()}`);
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

  const res = await fetch(`${API_BASE_URL}/brand-kit/logo`, {
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
  const res = await fetch(`${API_BASE_URL}/jobs/${jobId}/clips/${clipId}/schedule`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scheduledFor }),
  });
  if (!res.ok) {
    throw new Error(`Scheduling failed: ${res.status} ${await res.text()}`);
  }
}

export async function getCalendar(): Promise<CalendarEntry[]> {
  const res = await fetch(`${API_BASE_URL}/calendar`);
  if (!res.ok) {
    throw new Error(`Failed to fetch calendar: ${res.status}`);
  }
  return res.json();
}

export async function autoScheduleCalendar(intervalDays?: number): Promise<CalendarEntry[]> {
  const res = await fetch(`${API_BASE_URL}/calendar/auto-schedule`, {
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
  const res = await fetch(`${API_BASE_URL}/personas`);
  if (!res.ok) {
    throw new Error(`Failed to fetch personas: ${res.status}`);
  }
  return res.json();
}

export async function setActivePersona(persona: PersonaName | null): Promise<{ activePersona: PersonaName | null }> {
  const res = await fetch(`${API_BASE_URL}/personas/active`, {
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
  const res = await fetch(`${API_BASE_URL}/youtube/status`);
  if (!res.ok) {
    throw new Error(`Failed to fetch YouTube status: ${res.status}`);
  }
  return res.json();
}

export function youtubeConnectUrl(): string {
  return `${API_BASE_URL}/oauth/youtube/start`;
}

export async function disconnectYoutube(): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/youtube/disconnect`, { method: 'POST' });
  if (!res.ok) {
    throw new Error(`Failed to disconnect YouTube: ${res.status}`);
  }
}

export async function publishToYoutube(
  jobId: string,
  clipId: string,
  options: { title?: string; description?: string; privacyStatus?: 'private' | 'unlisted' | 'public' },
): Promise<{ videoId: string; url: string }> {
  const res = await fetch(`${API_BASE_URL}/jobs/${jobId}/clips/${clipId}/publish/youtube`, {
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
  const res = await fetch(`${API_BASE_URL}/analytics/youtube`);
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
  const res = await fetch(`${API_BASE_URL}/jobs/${jobId}/clips/${clipId}/regenerate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ modifier }),
  });

  if (!res.ok) {
    throw new Error(`Regenerate failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}
