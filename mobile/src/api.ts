import { API_BASE_URL } from './config';
import type { BrandKit, CaptionStyleName, Job, Language, Translation } from './types';

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
