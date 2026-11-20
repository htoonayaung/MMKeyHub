'use client';

import {
  backButton,
  hapticFeedback,
  init,
  isTMA,
  miniApp,
  retrieveLaunchParams,
  retrieveRawInitData,
  themeParams as tgThemeParams,
  viewport,
} from '@telegram-apps/sdk';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

export interface TelegramUser {
  id: number;
  firstName: string;
  lastName?: string;
  username?: string;
  languageCode?: string;
  isPremium?: boolean;
}

export interface TelegramTheme {
  bgColor?: string;
  secondaryBgColor?: string;
  textColor?: string;
  hintColor?: string;
  buttonColor?: string;
  buttonTextColor?: string;
}

export type HapticImpactStyle = 'light' | 'medium' | 'heavy' | 'rigid' | 'soft';
export type HapticNotificationType = 'success' | 'warning' | 'error';

export interface TelegramContextValue {
  isTelegram: boolean;
  isReady: boolean;
  initDataRaw: string | null;
  user: TelegramUser | null;
  themeParams: TelegramTheme | null;
  hapticImpact: (style?: HapticImpactStyle) => void;
  hapticNotification: (type: HapticNotificationType) => void;
  hapticSelection: () => void;
}

const noop = () => {};

const TelegramContext = createContext<TelegramContextValue>({
  isTelegram: false,
  isReady: false,
  initDataRaw: null,
  user: null,
  themeParams: null,
  hapticImpact: noop,
  hapticNotification: noop,
  hapticSelection: noop,
});

interface LegacyWebApp {
  initData?: string;
  initDataUnsafe?: {
    user?: {
      id: number;
      first_name: string;
      last_name?: string;
      username?: string;
      language_code?: string;
      is_premium?: boolean;
    };
  };
  themeParams?: Record<string, string | undefined>;
  ready?: () => void;
  expand?: () => void;
  BackButton?: {
    show?: () => void;
    hide?: () => void;
    onClick?: (cb: () => void) => void;
    offClick?: (cb: () => void) => void;
  };
  HapticFeedback?: {
    impactOccurred?: (style: HapticImpactStyle) => void;
    notificationOccurred?: (type: HapticNotificationType) => void;
    selectionChanged?: () => void;
  };
}

function getLegacyWebApp(): LegacyWebApp | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { Telegram?: { WebApp?: LegacyWebApp } }).Telegram?.WebApp;
}

function parseUserFromRawInitData(raw: string | null): TelegramUser | null {
  if (!raw) return null;
  try {
    const params = new URLSearchParams(raw);
    const userRaw = params.get('user');
    if (!userRaw) return null;
    const parsed = JSON.parse(userRaw) as {
      id?: number;
      first_name?: string;
      last_name?: string;
      username?: string;
      language_code?: string;
      is_premium?: boolean;
    };
    if (typeof parsed.id !== 'number') return null;
    return {
      id: parsed.id,
      firstName: parsed.first_name ?? 'Telegram User',
      lastName: parsed.last_name,
      username: parsed.username,
      languageCode: parsed.language_code,
      isPremium: parsed.is_premium,
    };
  } catch {
    return null;
  }
}

function normalizeSdkUser(rawUser: unknown): TelegramUser | null {
  if (!rawUser || typeof rawUser !== 'object') return null;
  const candidate = rawUser as Record<string, unknown>;
  if (typeof candidate.id !== 'number') return null;
  return {
    id: candidate.id,
    firstName: String(candidate.firstName ?? candidate.first_name ?? 'Telegram User'),
    lastName:
      typeof (candidate.lastName ?? candidate.last_name) === 'string'
        ? String(candidate.lastName ?? candidate.last_name)
        : undefined,
    username: typeof candidate.username === 'string' ? candidate.username : undefined,
    languageCode:
      typeof (candidate.languageCode ?? candidate.language_code) === 'string'
        ? String(candidate.languageCode ?? candidate.language_code)
        : undefined,
    isPremium:
      typeof (candidate.isPremium ?? candidate.is_premium) === 'boolean'
        ? Boolean(candidate.isPremium ?? candidate.is_premium)
        : undefined,
  };
}

function applyThemeCssVariables(theme: TelegramTheme | null): void {
  if (typeof document === 'undefined' || !theme) return;
  const root = document.documentElement;
  if (theme.bgColor) root.style.setProperty('--tg-theme-bg-color', theme.bgColor);
  if (theme.secondaryBgColor) {
    root.style.setProperty('--tg-theme-secondary-bg-color', theme.secondaryBgColor);
  }
  if (theme.textColor) root.style.setProperty('--tg-theme-text-color', theme.textColor);
  if (theme.hintColor) root.style.setProperty('--tg-theme-hint-color', theme.hintColor);
  if (theme.buttonColor) root.style.setProperty('--tg-theme-button-color', theme.buttonColor);
  if (theme.buttonTextColor) {
    root.style.setProperty('--tg-theme-button-text-color', theme.buttonTextColor);
  }
}

export function TelegramProvider({ children }: { children: React.ReactNode }) {
  const [baseState, setBaseState] = useState<{
    isTelegram: boolean;
    isReady: boolean;
    initDataRaw: string | null;
    user: TelegramUser | null;
    themeParams: TelegramTheme | null;
  }>({
    isTelegram: false,
    isReady: false,
    initDataRaw: null,
    user: null,
    themeParams: null,
  });

  useEffect(() => {
    let cancelled = false;

    async function bootstrapTelegram() {
      if (typeof window === 'undefined') return;

      const legacyWebApp = getLegacyWebApp();

      let insideTelegram = false;
      try {
        insideTelegram = Boolean(await isTMA());
      } catch {
        insideTelegram = false;
      }

      if (!insideTelegram && legacyWebApp?.initData) {
        insideTelegram = true;
      }

      if (!insideTelegram) {
        if (!cancelled) {
          setBaseState({
            isTelegram: false,
            isReady: true,
            initDataRaw: null,
            user: null,
            themeParams: null,
          });
        }
        return;
      }

      let rawInitData: string | null = null;
      let user: TelegramUser | null = null;
      let resolvedTheme: TelegramTheme | null = null;

      try {
        init();

        try {
          rawInitData = retrieveRawInitData() ?? null;
        } catch {
          rawInitData = null;
        }

        try {
          const launchParams = retrieveLaunchParams();
          const lpRecord = launchParams as unknown as Record<string, unknown>;
          const tgData = (lpRecord.tgWebAppData ?? {}) as Record<string, unknown>;
          user = normalizeSdkUser(tgData.user);

          const lpTheme = lpRecord.tgWebAppThemeParams as Record<string, string | undefined> | undefined;
          if (lpTheme) {
            resolvedTheme = {
              bgColor: lpTheme.bgColor ?? lpTheme.bg_color,
              secondaryBgColor: lpTheme.secondaryBgColor ?? lpTheme.secondary_bg_color,
              textColor: lpTheme.textColor ?? lpTheme.text_color,
              hintColor: lpTheme.hintColor ?? lpTheme.hint_color,
              buttonColor: lpTheme.buttonColor ?? lpTheme.button_color,
              buttonTextColor: lpTheme.buttonTextColor ?? lpTheme.button_text_color,
            };
          }
        } catch {
          // Launch params fallback handled below
        }

        if (miniApp.mount.isAvailable()) {
          miniApp.mount();
        }
        if (miniApp.ready.isAvailable()) {
          miniApp.ready();
        }

        if (backButton.mount.isAvailable()) {
          backButton.mount();
        }

        if (tgThemeParams.mount.isAvailable()) {
          tgThemeParams.mount();
        }
        if (tgThemeParams.bindCssVars.isAvailable()) {
          tgThemeParams.bindCssVars();
        }

        if (viewport.mount.isAvailable()) {
          await viewport.mount();
          if (viewport.expand.isAvailable()) {
            viewport.expand();
          }
        }
      } catch (err) {
        console.warn('[TelegramProvider] Non-fatal SDK init warning:', err);
      }

      // Safe fallback to window.Telegram.WebApp if available
      if (legacyWebApp) {
        try {
          legacyWebApp.ready?.();
          legacyWebApp.expand?.();
        } catch {
          // ignore
        }
        if (!rawInitData && legacyWebApp.initData) {
          rawInitData = legacyWebApp.initData;
        }
        if (!user && legacyWebApp.initDataUnsafe?.user) {
          user = normalizeSdkUser(legacyWebApp.initDataUnsafe.user);
        }
        if (!resolvedTheme && legacyWebApp.themeParams) {
          resolvedTheme = {
            bgColor: legacyWebApp.themeParams.bg_color,
            secondaryBgColor: legacyWebApp.themeParams.secondary_bg_color,
            textColor: legacyWebApp.themeParams.text_color,
            hintColor: legacyWebApp.themeParams.hint_color,
            buttonColor: legacyWebApp.themeParams.button_color,
            buttonTextColor: legacyWebApp.themeParams.button_text_color,
          };
        }
      }

      if (!user && rawInitData) {
        user = parseUserFromRawInitData(rawInitData);
      }

      applyThemeCssVariables(resolvedTheme);

      if (!cancelled) {
        setBaseState({
          isTelegram: true,
          isReady: true,
          initDataRaw: rawInitData,
          user,
          themeParams: resolvedTheme,
        });
      }
    }

    void bootstrapTelegram();

    return () => {
      cancelled = true;
    };
  }, []);

  const hapticImpact = useCallback(
    (style: HapticImpactStyle = 'light') => {
      if (!baseState.isTelegram) return;
      try {
        if (hapticFeedback.impactOccurred.isAvailable()) {
          hapticFeedback.impactOccurred(style);
          return;
        }
      } catch {
        // fallback below
      }
      getLegacyWebApp()?.HapticFeedback?.impactOccurred?.(style);
    },
    [baseState.isTelegram]
  );

  const hapticNotification = useCallback(
    (type: HapticNotificationType) => {
      if (!baseState.isTelegram) return;
      try {
        if (hapticFeedback.notificationOccurred.isAvailable()) {
          hapticFeedback.notificationOccurred(type);
          return;
        }
      } catch {
        // fallback below
      }
      getLegacyWebApp()?.HapticFeedback?.notificationOccurred?.(type);
    },
    [baseState.isTelegram]
  );

  const hapticSelection = useCallback(() => {
    if (!baseState.isTelegram) return;
    try {
      if (hapticFeedback.selectionChanged.isAvailable()) {
        hapticFeedback.selectionChanged();
        return;
      }
    } catch {
      // fallback below
    }
    getLegacyWebApp()?.HapticFeedback?.selectionChanged?.();
  }, [baseState.isTelegram]);

  return (
    <TelegramContext.Provider
      value={{
        ...baseState,
        hapticImpact,
        hapticNotification,
        hapticSelection,
      }}
    >
      {children}
    </TelegramContext.Provider>
  );
}

export function useTelegram(): TelegramContextValue {
  return useContext(TelegramContext);
}

/**
 * Hooks into native Telegram Mini App BackButton when `enabled` is true
 * (e.g., when a modal or drawer is open), hiding cleanly on unmount.
 */
export function useTelegramBackButton(enabled: boolean, onBack: () => void): void {
  const { isTelegram } = useTelegram();
  const callbackRef = useRef(onBack);

  useEffect(() => {
    callbackRef.current = onBack;
  }, [onBack]);

  useEffect(() => {
    if (!isTelegram || !enabled) return;

    const handler = () => {
      callbackRef.current();
    };

    let offSdkClick: VoidFunction | undefined;
    let usedSdk = false;

    try {
      if (backButton.mount.isAvailable() && !backButton.isMounted()) {
        backButton.mount();
      }
      if (backButton.show.isAvailable()) {
        backButton.show();
      }
      if (backButton.onClick.isAvailable()) {
        offSdkClick = backButton.onClick(handler);
        usedSdk = true;
      }
    } catch {
      usedSdk = false;
    }

    const legacyBack = !usedSdk ? getLegacyWebApp()?.BackButton : undefined;
    if (legacyBack) {
      try {
        legacyBack.show?.();
        legacyBack.onClick?.(handler);
      } catch {
        // ignore
      }
    }

    return () => {
      if (offSdkClick) {
        try {
          offSdkClick();
        } catch {
          // ignore
        }
      }
      try {
        if (backButton.hide.isAvailable()) {
          backButton.hide();
        }
      } catch {
        // ignore
      }
      if (legacyBack) {
        try {
          legacyBack.offClick?.(handler);
          legacyBack.hide?.();
        } catch {
          // ignore
        }
      }
    };
  }, [isTelegram, enabled]);
}
