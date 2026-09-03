import 'dotenv/config';

export const env = {
  port: Number(process.env.PORT ?? 4000),
  storageDir: process.env.STORAGE_DIR ?? 'storage',
  assemblyAiApiKey: process.env.ASSEMBLYAI_API_KEY ?? '',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
  pexelsApiKey: process.env.PEXELS_API_KEY ?? '',
  jamendoClientId: process.env.JAMENDO_CLIENT_ID ?? '',
  youtubeClientId: process.env.YOUTUBE_CLIENT_ID ?? '',
  youtubeClientSecret: process.env.YOUTUBE_CLIENT_SECRET ?? '',
  youtubeRedirectUri: process.env.YOUTUBE_REDIRECT_URI ?? '',
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? '',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
  googleRedirectUri: process.env.GOOGLE_REDIRECT_URI ?? '',
  databaseUrl: process.env.DATABASE_URL ?? '',
  jwtSecret: process.env.JWT_SECRET ?? '',
};
