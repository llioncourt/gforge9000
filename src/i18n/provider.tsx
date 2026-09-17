import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import type { i18n as I18nInstance } from "i18next";
import {
  DEFAULT_LOCALE,
  type LocaleDefinition,
  enabledLocales,
  getLocale,
  normalizeLocale,
} from "./config";
import { createI18nInstance } from "./index";
import { persistLocale } from "./detect";

interface LocaleContextValue {
  locale: string;
  definition: LocaleDefinition;
  locales: LocaleDefinition[];
  setLocale: (locale: string) => void;
  /** Called by the account layer to apply a stored profile preference. */
  applyAccountLocale: (locale: string | null | undefined) => void;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

/**
 * Single i18n provider for the whole application. The i18next instance is
 * created once per session (or per SSR render) and never inside a component
 * render, so changing language re-renders only translated subtrees.
 */
export function I18nProvider({
  initialLocale = DEFAULT_LOCALE,
  children,
}: {
  initialLocale?: string;
  children: ReactNode;
}) {
  const [locale, setLocaleState] = useState(() => normalizeLocale(initialLocale));
  const [i18n] = useState<I18nInstance>(() => createI18nInstance(normalizeLocale(initialLocale)));

  const applyLocale = useCallback(
    (next: string, persist: boolean) => {
      const code = normalizeLocale(next);
      setLocaleState((current) => (current === code ? current : code));
      if (i18n.language !== code) void i18n.changeLanguage(code);
      if (persist && typeof window !== "undefined") persistLocale(code);
    },
    [i18n],
  );

  const setLocale = useCallback((next: string) => applyLocale(next, true), [applyLocale]);

  const applyAccountLocale = useCallback(
    (next: string | null | undefined) => {
      if (!next) return;
      applyLocale(next, true);
    },
    [applyLocale],
  );

  // Keep the document in sync (language + writing direction, RTL ready).
  useEffect(() => {
    const def = getLocale(locale);
    document.documentElement.lang = def.code;
    document.documentElement.dir = def.dir;
  }, [locale]);

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      definition: getLocale(locale),
      locales: enabledLocales(),
      setLocale,
      applyAccountLocale,
    }),
    [locale, setLocale, applyAccountLocale],
  );

  return (
    <I18nextProvider i18n={i18n}>
      <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
    </I18nextProvider>
  );
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    throw new Error("useLocale must be used inside <I18nProvider>");
  }
  return ctx;
}
