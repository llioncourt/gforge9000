import { intlLocale } from "./config";

/**
 * Locale-aware formatting helpers. Never hardcode date patterns, decimal
 * separators or currency symbols anywhere else in the app.
 */

const dateCache = new Map<string, Intl.DateTimeFormat>();
const numberCache = new Map<string, Intl.NumberFormat>();
const relativeCache = new Map<string, Intl.RelativeTimeFormat>();

function dateFormatter(locale: string, options: Intl.DateTimeFormatOptions) {
  const key = `${locale}|${JSON.stringify(options)}`;
  let fmt = dateCache.get(key);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat(intlLocale(locale), options);
    dateCache.set(key, fmt);
  }
  return fmt;
}

function numberFormatter(locale: string, options: Intl.NumberFormatOptions) {
  const key = `${locale}|${JSON.stringify(options)}`;
  let fmt = numberCache.get(key);
  if (!fmt) {
    fmt = new Intl.NumberFormat(intlLocale(locale), options);
    numberCache.set(key, fmt);
  }
  return fmt;
}

export type DateInput = Date | string | number | null | undefined;

function toDate(value: DateInput): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export type DateStyle = "short" | "medium" | "long";

export function formatDate(locale: string, value: DateInput, style: DateStyle = "medium"): string {
  const date = toDate(value);
  if (!date) return "";
  return dateFormatter(locale, { dateStyle: style }).format(date);
}

export function formatDateTime(
  locale: string,
  value: DateInput,
  style: DateStyle = "medium",
): string {
  const date = toDate(value);
  if (!date) return "";
  return dateFormatter(locale, { dateStyle: style, timeStyle: "short" }).format(date);
}

export function formatTime(locale: string, value: DateInput): string {
  const date = toDate(value);
  if (!date) return "";
  return dateFormatter(locale, { timeStyle: "short" }).format(date);
}

export function formatNumber(
  locale: string,
  value: number | null | undefined,
  options: Intl.NumberFormatOptions = {},
): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "";
  return numberFormatter(locale, options).format(value);
}

/** Currency is a property of the data, never of the interface language. */
export function formatCurrency(
  locale: string,
  value: number | null | undefined,
  currency: string,
  options: Intl.NumberFormatOptions = {},
): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "";
  return numberFormatter(locale, { style: "currency", currency, ...options }).format(value);
}

/** Byte sizes shown in upload / media screens. */
export function formatBytes(locale: string, bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || Number.isNaN(bytes)) return "";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = unit === 0 ? 0 : value < 10 ? 1 : 0;
  return `${formatNumber(locale, value, { maximumFractionDigits: digits })} ${units[unit]}`;
}

/** "3 days ago" / "há 3 dias" */
export function formatRelativeTime(locale: string, value: DateInput, now: Date = new Date()) {
  const date = toDate(value);
  if (!date) return "";
  let fmt = relativeCache.get(locale);
  if (!fmt) {
    fmt = new Intl.RelativeTimeFormat(intlLocale(locale), { numeric: "auto" });
    relativeCache.set(locale, fmt);
  }
  const diff = date.getTime() - now.getTime();
  const table: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 1000 * 60 * 60 * 24 * 365],
    ["month", 1000 * 60 * 60 * 24 * 30],
    ["day", 1000 * 60 * 60 * 24],
    ["hour", 1000 * 60 * 60],
    ["minute", 1000 * 60],
  ];
  for (const [unit, ms] of table) {
    if (Math.abs(diff) >= ms) return fmt.format(Math.round(diff / ms), unit);
  }
  return fmt.format(Math.round(diff / 1000), "second");
}

/** Duration in seconds rendered as m:ss / h:mm:ss (locale-aware digits). */
export function formatDuration(locale: string, seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) return "";
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) =>
    formatNumber(locale, n, { minimumIntegerDigits: 2, useGrouping: false });
  return h > 0
    ? `${formatNumber(locale, h)}:${pad(m)}:${pad(s)}`
    : `${formatNumber(locale, m)}:${pad(s)}`;
}
