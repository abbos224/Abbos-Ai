import fs from 'node:fs';
import path from 'node:path';
import { env } from './env.js';
import type { CaptionStyleName } from './ass.js';
import type { SoundEffectsStyle } from './soundEffects.js';

export type BrandKit = {
  logoFile?: string; // path relative to storage dir, e.g. 'brand/logo.png'
  accentColor?: string; // '#RRGGBB'
  captionStyle?: CaptionStyleName;
  soundEffectsStyle?: SoundEffectsStyle; // defaults to 'professional' (no effects) when unset
};

const brandKitPath = path.join(env.storageDir, 'brandKit.json');

export function getBrandKit(): BrandKit {
  if (!fs.existsSync(brandKitPath)) return {};
  return JSON.parse(fs.readFileSync(brandKitPath, 'utf-8'));
}

export function updateBrandKit(patch: Partial<BrandKit>): BrandKit {
  const updated = { ...getBrandKit(), ...patch };
  fs.mkdirSync(path.dirname(brandKitPath), { recursive: true });
  fs.writeFileSync(brandKitPath, JSON.stringify(updated, null, 2));
  return updated;
}
