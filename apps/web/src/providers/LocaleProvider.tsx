'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { dictionary, type UiLocale } from '@/i18n/dictionary';
import { useTelegram } from './TelegramProvider';

interface LocaleContextValue {
  locale: UiLocale;
  setLocale: (next: UiLocale) => void;
  toggleLocale: () => void;
  t: (typeof dictionary)[UiLocale];
}

const STORAGE_KEY = 'mmkeyhub_locale';

const LocaleContext = createContext<LocaleContextValue>({
  locale: 'en',
  setLocale: () => undefined,
  toggleLocale: () => undefined,
  t: dictionary.en,
});

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const { user, isReady } = useTelegram();
  const [locale, setLocaleState] = useState<UiLocale>(
    process.env.NEXT_PUBLIC_DEFAULT_LOCALE === 'mm' ? 'mm' : 'en'
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'mm') {
      setLocaleState(saved);
      return;
    }
    if (isReady && user?.languageCode === 'my') {
      setLocaleState('mm');
    }
  }, [isReady, user]);

  function setLocale(next: UiLocale) {
    setLocaleState(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, next);
    }
  }

  function toggleLocale() {
    setLocale(locale === 'en' ? 'mm' : 'en');
  }

  return (
    <LocaleContext.Provider
      value={{
        locale,
        setLocale,
        toggleLocale,
        t: dictionary[locale],
      }}
    >
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  return useContext(LocaleContext);
}
