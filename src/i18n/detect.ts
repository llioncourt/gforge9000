import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { DEFAULT_LOCALE, LOCALE_STORAGE_KEY, isSupportedLocale, normalizeLocale } from "./config";

/** Cookie used so the server renders the same language the client will use. */
export const LOCALE_COOKIE = "ucf_locale";

function fromCookieHeader(header: string | null | undefined): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === LOCALE_COOKIE) return decodeURIComponent(rest.join("="));
  }
  return null;
}

/** Picks the best supported locale out of an Accept-Language header. */
export function fromAcceptLanguage(header: string | null | undefined): string | null {
  if (!header) return null;
  const candidates = header
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.find((p) => p.trim().startsWith("q="));
      return { tag: (tag ?? "").trim(), q: q ? Number(q.split("=")[1]) : 1 };
    })
    .filter((c) => c.tag)
    .sort((a, b) => b.q - a.q);
  for (const c of candidates) {
    if (isSupportedLocale(c.tag)) return normalizeLocale(c.tag);
  }
  return null;
}

/**
 * Resolves the locale with a single, documented precedence:
 * 1. explicit choice persisted in the cookie (mirrors profile preference)
 * 2. explicit choice persisted in localStorage (client only)
 * 3. browser / Accept-Language
 * 4. default locale
 *
 * The account preference is applied on top of this by `I18nProvider` once the
 * profile query resolves.
 */
export const detectLocale = createIsomorphicFn()
  .server((): string => {
    try {
      const headers = getRequestHeaders();
      const cookie = fromCookieHeader(headers.get("cookie"));
      if (cookie && isSupportedLocale(cookie)) return normalizeLocale(cookie);
      return fromAcceptLanguage(headers.get("accept-language")) ?? DEFAULT_LOCALE;
    } catch {
      return DEFAULT_LOCALE;
    }
  })
  .client((): string => {
    try {
      const cookie = fromCookieHeader(document.cookie);
      if (cookie && isSupportedLocale(cookie)) return normalizeLocale(cookie);
      const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
      if (stored && isSupportedLocale(stored)) return normalizeLocale(stored);
      for (const tag of navigator.languages ?? [navigator.language]) {
        if (isSupportedLocale(tag)) return normalizeLocale(tag);
      }
    } catch {
      /* storage can be unavailable — fall through to the default */
    }
    return DEFAULT_LOCALE;
  });

/** Persists an explicit choice for future visits (cookie + localStorage). */
export function persistLocale(locale: string) {
  const code = normalizeLocale(locale);
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, code);
  } catch {
    /* ignore */
  }
  try {
    const oneYear = 60 * 60 * 24 * 365;
    document.cookie = `${LOCALE_COOKIE}=${encodeURIComponent(code)}; path=/; max-age=${oneYear}; samesite=lax`;
  } catch {
    /* ignore */
  }
}
