import { Resend } from 'resend';
import { env } from './env.js';

let client: Resend | undefined;

export function isConfigured(): boolean {
  return Boolean(env.resendApiKey && env.resendFromEmail);
}

function getClient(): Resend {
  if (!isConfigured()) {
    throw new Error('RESEND_API_KEY/RESEND_FROM_EMAIL are not set. Add them to server/.env');
  }
  if (!client) client = new Resend(env.resendApiKey);
  return client;
}

async function send(to: string, subject: string, html: string): Promise<void> {
  const { error } = await getClient().emails.send({ from: env.resendFromEmail, to, subject, html });
  if (error) throw new Error(`Resend error: ${error.message}`);
}

export async function sendVerificationEmail(to: string, code: string): Promise<void> {
  await send(
    to,
    'Verify your MrAiBos email',
    `<p>Your verification code is:</p><h2 style="letter-spacing:4px">${code}</h2><p>This code expires in 15 minutes.</p>`,
  );
}

export async function sendPasswordResetEmail(to: string, code: string): Promise<void> {
  await send(
    to,
    'Reset your MrAiBos password',
    `<p>Your password reset code is:</p><h2 style="letter-spacing:4px">${code}</h2><p>This code expires in 15 minutes. If you didn't request this, you can ignore this email.</p>`,
  );
}
