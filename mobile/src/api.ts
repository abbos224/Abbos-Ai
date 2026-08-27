import { API_BASE_URL } from './config';
import type { Job } from './types';

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
