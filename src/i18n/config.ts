/**
 * Central i18n configuration.
 *
 * Every part of the application (engine, language selector, persistence,
 * formatters, QA scripts) reads the language list from this single file.
 * Adding a language = add an entry here + a folder under `src/i18n/locales`.
 */

export type LocaleDirection = "ltr" | "rtl";

export interface LocaleDefinition {
  /** BCP-47 code used everywhere (storage, Intl, html lang attribute). */
  code: string;
  /** English name, used in developer tooling. */
  name: string;
  /** Name shown to users, written in the language itself. */
  nativeName: string;
  /** Writing direction; drives the `dir` attribute on <html>. */
  dir: LocaleDirection;
  /** Language used when a key is missing here. */
  fallback: string | null;
  /** Disabled locales are never offered in the language selector. */
  enabled: boolean;
  /** Extra BCP-47 tags that should resolve to this locale. */
  aliases: string[];
  /** Locale passed to Intl.* formatters. */
  intlLocale: string;
}

export const DEFAULT_LOCALE = "en";
export const FALLBACK_LOCALE = "en";

/**
 * Development-only locale that highlights untranslated strings. It is never
 * offered in the language selector unless the developer turns it on explicitly
 * with `VITE_PSEUDO=1 bun run dev`, so it can never appear for a real user.
 */
export const PSEUDO_LOCALE = "en-XA";

/**
 * The single gate for pseudo-localization. Reads build-time constants only, so
 * the server and the client always agree (no hydration mismatch).
 */
export function pseudoEnabled(): boolean {
  return import.meta.env?.DEV === true && import.meta.env?.VITE_PSEUDO === "1";
}

export const LOCALES: readonly LocaleDefinition[] = [
  {
    code: "en",
    name: "English",
    nativeName: "English",
    dir: "ltr",
    fallback: null,
    enabled: true,
    aliases: ["en-US", "en-GB", "en-AU", "en-CA", "en-NZ", "en-IE", "en-ZA"],
    intlLocale: "en-US",
  },
  {
    code: "pt-BR",
    name: "Portuguese (Brazil)",
    nativeName: "Português (Brasil)",
    dir: "ltr",
    fallback: FALLBACK_LOCALE,
    enabled: true,
    aliases: ["pt", "pt-PT", "pt-br", "br"],
    intlLocale: "pt-BR",
  },
  {
    code: PSEUDO_LOCALE,
    name: "Pseudo-localization (development)",
    nativeName: "Pseudo",
    dir: "ltr",
    fallback: FALLBACK_LOCALE,
    enabled: pseudoEnabled(),
    aliases: ["en-xa", "pseudo"],
    intlLocale: "en-US",
  },
];

export const SUPPORTED_LOCALE_CODES = LOCALES.map((l) => l.code);

export function enabledLocales(): LocaleDefinition[] {
  return LOCALES.filter((l) => l.enabled);
}

export function getLocale(code: string | null | undefined): LocaleDefinition {
  return findLocale(code) ?? getLocaleStrict(DEFAULT_LOCALE);
}

function getLocaleStrict(code: string): LocaleDefinition {
  const found = LOCALES.find((l) => l.code === code);
  if (!found) throw new Error(`Unknown locale: ${code}`);
  return found;
}

/**
 * Normalizes any incoming language tag (browser, profile, storage, URL) to a
 * supported locale code. This is the ONLY place locale strings are compared.
 */
export function normalizeLocale(input: string | null | undefined): string {
  if (!input) return DEFAULT_LOCALE;
  return (findLocale(input) ?? getLocaleStrict(DEFAULT_LOCALE)).code;
}

export function isSupportedLocale(input: string | null | undefined): boolean {
  return findLocale(input) !== undefined;
}

function findLocale(input: string | null | undefined): LocaleDefinition | undefined {
  if (!input) return undefined;
  const raw = input.trim();
  if (!raw) return undefined;
  const lower = raw.toLowerCase();
  // Locales switched off for this build are invisible: a stale "en-XA" saved in
  // a cookie, in local storage or on the profile must never reach the screen.
  const candidates = LOCALES.filter((l) => l.enabled);
  const exact = candidates.find(
    (l) => l.code.toLowerCase() === lower || l.aliases.some((a) => a.toLowerCase() === lower),
  );
  if (exact) return exact;
  // Fall back to the primary subtag: "pt-AO" -> "pt" -> pt-BR
  const primary = lower.split("-")[0];
  if (!primary) return undefined;
  return candidates.find(
    (l) =>
      l.code.toLowerCase().split("-")[0] === primary ||
      l.aliases.some((a) => a.toLowerCase().split("-")[0] === primary),
  );
}

export function localeDirection(code: string): LocaleDirection {
  return getLocale(code).dir;
}

/** Locale string for Intl.* APIs. */
export function intlLocale(code: string): string {
  return getLocale(code).intlLocale;
}

/**
 * Translation namespaces. One file per namespace per locale under
 * `src/i18n/locales/<locale>/<namespace>.json`.
 */
export const NAMESPACES = [
  "common",
  "navigation",
  "errors",
  "auth",
  "dashboard",
  "characters",
  "campaigns",
  "lore",
  "media",
  "library",
  "packs",
  "rules",
  "settings",
  "battle",
  "dice",
  "marketing",
] as const;

export type Namespace = (typeof NAMESPACES)[number];

/**
 * Namespaces bundled with the initial payload — everything visible in the app
 * frame before any route renders. All others are fetched on demand.
 */
export const CORE_NAMESPACES: Namespace[] = ["common", "navigation", "errors"];

export const LOCALE_STORAGE_KEY = "ucf.locale";
