/**
 * Locale context and the hook that reads it. The provider component lives in
 * `provider.tsx`.
 */
import { createContext, useContext } from "react";
import type { LocaleDefinition } from "./config";

export interface LocaleContextValue {
  locale: string;
  definition: LocaleDefinition;
  locales: LocaleDefinition[];
  setLocale: (locale: string) => void;
  /** Called by the account layer to apply a stored profile preference. */
  applyAccountLocale: (locale: string | null | undefined) => void;
}

export const LocaleContext = createContext<LocaleContextValue | null>(null);

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    throw new Error("useLocale must be used inside <I18nProvider>");
  }
  return ctx;
}
