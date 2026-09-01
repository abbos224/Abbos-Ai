import { getPool } from './db.js';
import type { CaptionStyleName } from './ass.js';
import type { SoundEffectsStyle } from './soundEffects.js';

export type BrandKit = {
  logoFile?: string; // path relative to storage dir, e.g. 'brand/<userId>.png'
  accentColor?: string; // '#RRGGBB'
  captionStyle?: CaptionStyleName;
  soundEffectsStyle?: SoundEffectsStyle; // defaults to 'professional' (no effects) when unset
};

type BrandKitRow = {
  logo_file: string | null;
  accent_color: string | null;
  caption_style: string | null;
  sound_effects_style: string | null;
};

function rowToBrandKit(row: BrandKitRow | undefined): BrandKit {
  if (!row) return {};
  return {
    logoFile: row.logo_file ?? undefined,
    accentColor: row.accent_color ?? undefined,
    captionStyle: (row.caption_style as CaptionStyleName | null) ?? undefined,
    soundEffectsStyle: (row.sound_effects_style as SoundEffectsStyle | null) ?? undefined,
  };
}

export async function getBrandKit(userId: string): Promise<BrandKit> {
  const result = await getPool().query<BrandKitRow>(
    'SELECT logo_file, accent_color, caption_style, sound_effects_style FROM brand_kits WHERE user_id = $1',
    [userId],
  );
  return rowToBrandKit(result.rows[0]);
}

export async function updateBrandKit(userId: string, patch: Partial<BrandKit>): Promise<BrandKit> {
  const updated = { ...(await getBrandKit(userId)), ...patch };
  await getPool().query(
    `INSERT INTO brand_kits (user_id, logo_file, accent_color, caption_style, sound_effects_style)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id) DO UPDATE SET
       logo_file = EXCLUDED.logo_file,
       accent_color = EXCLUDED.accent_color,
       caption_style = EXCLUDED.caption_style,
       sound_effects_style = EXCLUDED.sound_effects_style`,
    [
      userId,
      updated.logoFile ?? null,
      updated.accentColor ?? null,
      updated.captionStyle ?? null,
      updated.soundEffectsStyle ?? null,
    ],
  );
  return updated;
}
