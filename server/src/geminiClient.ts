import { GoogleGenAI } from '@google/genai';
import { env } from './env.js';

let client: GoogleGenAI | undefined;

export function getGeminiClient(): GoogleGenAI {
  if (!env.geminiApiKey) {
    throw new Error('GEMINI_API_KEY is not set. Add it to server/.env');
  }
  if (!client) client = new GoogleGenAI({ apiKey: env.geminiApiKey });
  return client;
}
