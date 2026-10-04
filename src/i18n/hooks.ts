import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { Namespace } from "./config";
import { useLocale } from "./locale-context";
import {
  formatBytes,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatDuration,
  formatNumber,
  formatRelativeTime,
  formatTime,
  type DateInput,
  type DateStyle,
} from "./format";

/** Typed wrapper around react-i18next's useTranslation (namespace-aware). */
export function useT(ns: Namespace = "common") {
  return useTranslation(ns);
}

/**
 * Locale-bound formatters. Memoized per locale so components never rebuild
 * Intl instances on every render.
 */
export function useFormatters() {
  const { locale } = useLocale();
  return useMemo(
    () => ({
      locale,
      date: (value: DateInput, style?: DateStyle) => formatDate(locale, value, style),
      dateTime: (value: DateInput, style?: DateStyle) => formatDateTime(locale, value, style),
      time: (value: DateInput) => formatTime(locale, value),
      relative: (value: DateInput) => formatRelativeTime(locale, value),
      number: (value: number | null | undefined, options?: Intl.NumberFormatOptions) =>
        formatNumber(locale, value, options),
      currency: (value: number | null | undefined, currency: string) =>
        formatCurrency(locale, value, currency),
      bytes: (value: number | null | undefined) => formatBytes(locale, value),
      duration: (value: number | null | undefined) => formatDuration(locale, value),
    }),
    [locale],
  );
}
