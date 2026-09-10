import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getSavedLanguage, saveLanguage } from '../languageStorage';
import { DEFAULT_LANGUAGE, translate, type Language, type TranslationKey } from './index';

type LanguageContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  /** Look up a key in the current language (falls back to English, then the key). */
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
};

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>(DEFAULT_LANGUAGE);

  useEffect(() => {
    getSavedLanguage().then((saved) => {
      if (saved) setLanguageState(saved);
    });
  }, []);

  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next);
    saveLanguage(next).catch(() => {
      // A failed write just means the choice won't survive an app restart — not worth
      // interrupting the user over.
    });
  }, []);

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      setLanguage,
      t: (key, params) => translate(language, key, params),
    }),
    [language, setLanguage],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useI18n(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useI18n must be used inside <LanguageProvider>');
  return ctx;
}
