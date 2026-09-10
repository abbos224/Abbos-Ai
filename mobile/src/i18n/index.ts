import { en } from './en';
import { ru } from './ru';
import { uz } from './uz';

export type Language = 'en' | 'ru' | 'uz';

export const LANGUAGES: { code: Language; label: string }[] = [
  { code: 'ru', label: 'Русский' },
  { code: 'uz', label: 'Oʻzbekcha' },
  { code: 'en', label: 'English' },
];

// The app ships Russian-first per the product decision; a viewer switches from Menu (or Login).
export const DEFAULT_LANGUAGE: Language = 'ru';

/** Every user-facing key. `en` is the source of truth for the key set; `ru`/`uz` are checked
 * against it at type level so a missing/typo'd key fails `tsc`, not silently at runtime. */
export type TranslationKey = keyof typeof en;

const DICTIONARIES: Record<Language, Record<TranslationKey, string>> = { en, ru, uz };

/**
 * Look up `key` in `language`, falling back to English, then to the key itself (so a missing
 * string is visible in dev rather than rendering blank). `params` fills `{name}` placeholders.
 */
export function translate(language: Language, key: TranslationKey, params?: Record<string, string | number>): string {
  const template = DICTIONARIES[language][key] ?? en[key] ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, name) => (name in params ? String(params[name]) : `{${name}}`));
}
