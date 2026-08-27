import { AssemblyAI } from 'assemblyai';
import { env } from './env.js';

export type Word = { text: string; start: number; end: number }; // seconds

let client: AssemblyAI | undefined;

function getClient(): AssemblyAI {
  if (!env.assemblyAiApiKey) {
    throw new Error('ASSEMBLYAI_API_KEY is not set. Add it to server/.env');
  }
  if (!client) client = new AssemblyAI({ apiKey: env.assemblyAiApiKey });
  return client;
}

export async function transcribeVideo(filePath: string): Promise<Word[]> {
  const transcript = await getClient().transcripts.transcribe({ audio: filePath });

  if (transcript.status === 'error') {
    throw new Error(`Transcription failed: ${transcript.error}`);
  }

  const words = transcript.words ?? [];
  return words.map((w) => ({
    text: w.text,
    start: w.start / 1000,
    end: w.end / 1000,
  }));
}
