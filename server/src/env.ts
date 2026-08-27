import 'dotenv/config';

export const env = {
  port: Number(process.env.PORT ?? 4000),
  storageDir: process.env.STORAGE_DIR ?? 'storage',
  assemblyAiApiKey: process.env.ASSEMBLYAI_API_KEY ?? '',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
};
