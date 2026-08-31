import { API_BASE_URL } from './config';
import type { CalendarEntry, Job, Language, Translation } from './types';

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
