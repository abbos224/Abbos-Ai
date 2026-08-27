import { AssemblyAI } from 'assemblyai';
import { env } from './env.js';

// seconds. `speaker` is AssemblyAI's diarization label (e.g. "A", "B") when there's more than
// one voice in the audio; undefined for single-speaker content.
export type Word = { text: string; start: number; end: number; speaker?: string };

let client: AssemblyAI | undefined;

function getClient(): AssemblyAI {
  if (!env.assemblyAiApiKey) {
    throw new Error('ASSEMBLYAI_API_KEY is not set. Add it to server/.env');
  }
  if (!client) client = new AssemblyAI({ apiKey: env.assemblyAiApiKey });
  return client;
}

export async function transcribeVideo(filePath: string): Promise<Word[]> {
  const transcript = await getClient().transcripts.transcribe({
    audio: filePath,
    speaker_labels: true,
  });

  if (transcript.status === 'error') {
    throw new Error(`Transcription failed: ${transcript.error}`);
  }

  const words = transcript.words ?? [];
  return words.map((w) => ({
    text: w.text,
    start: w.start / 1000,
    end: w.end / 1000,
    speaker: w.speaker ?? undefined,
  }));
}
