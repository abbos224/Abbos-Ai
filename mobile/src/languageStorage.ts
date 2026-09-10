import * as SecureStore from 'expo-secure-store';
import type { Language } from './i18n';

// A UI preference, not a credential — SecureStore is used only because it's the storage module
// this app already depends on (no AsyncStorage in the tree); nothing sensitive is kept here.
const LANGUAGE_KEY = 'mraibos_language';

export async function saveLanguage(language: Language): Promise<void> {
  await SecureStore.setItemAsync(LANGUAGE_KEY, language);
}

export async function getSavedLanguage(): Promise<Language | null> {
  const value = await SecureStore.getItemAsync(LANGUAGE_KEY);
  return value === 'en' || value === 'ru' || value === 'uz' ? value : null;
}
