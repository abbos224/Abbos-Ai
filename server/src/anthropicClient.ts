import Anthropic from '@anthropic-ai/sdk';
import { env } from './env.js';

let client: Anthropic | undefined;

export function getAnthropicClient(): Anthropic {
  if (!env.anthropicApiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set. Add it to server/.env');
  }
  if (!client) client = new Anthropic({ apiKey: env.anthropicApiKey });
  return client;
}
