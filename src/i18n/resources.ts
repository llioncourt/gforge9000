import {
  CORE_NAMESPACES,
  FALLBACK_LOCALE,
  NAMESPACES,
  PSEUDO_LOCALE,
  type Namespace,
} from "./config";

export type ResourceBundle = Record<string, unknown>;

/**
 * Core namespaces are bundled statically (tiny, needed by the app frame).
 * Everything else is code-split and fetched the first time a screen asks
 * for it, so unused locales/namespaces never reach the initial bundle.
 */
const eagerModules = import.meta.glob<{ default: ResourceBundle }>(
  "./locales/*/{common,navigation,errors}.json",
  { eager: true },
);

const lazyModules = import.meta.glob<{ default: ResourceBundle }>("./locales/*/*.json");

function key(locale: string, namespace: string) {
  return `./locales/${locale}/${namespace}.json`;
}

export function coreResources(locale: string): Record<string, ResourceBundle> {
  const out: Record<string, ResourceBundle> = {};
  for (const ns of CORE_NAMESPACES) {
    const mod = eagerModules[key(locale, ns)];
    if (mod) out[ns] = mod.default;
  }
  return out;
}

const cache = new Map<string, Promise<ResourceBundle | null>>();

export function loadNamespace(locale: string, namespace: string): Promise<ResourceBundle | null> {
  const cacheKey = key(locale, namespace);
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const loader = lazyModules[cacheKey];
  const promise: Promise<ResourceBundle | null> = loader
    ? loader().then((m) => m.default)
    : Promise.resolve(null);

  cache.set(cacheKey, promise);
  return promise;
}

export function isKnownNamespace(ns: string): ns is Namespace {
  return (NAMESPACES as readonly string[]).includes(ns);
}

/* ------------------------------------------------------------------ */
/* Pseudo-localization (development aid, never enabled in production)  */
/* ------------------------------------------------------------------ */

const PSEUDO_MAP: Record<string, string> = {
  a: "á",
  e: "é",
  i: "í",
  o: "ó",
  u: "ú",
  c: "ç",
  n: "ñ",
  A: "Á",
  E: "É",
  I: "Í",
  O: "Ó",
  U: "Ú",
};

function pseudoizeString(value: string): string {
  // Keep {{interpolation}} and <0>tags</0> untouched, pad by ~30% to expose
  // layouts that break with longer translations.
  const converted = value.replace(/(\{\{[^}]+\}\}|<[^>]+>)|([\s\S])/g, (_m, keep, ch) =>
    keep ? keep : (PSEUDO_MAP[ch] ?? ch),
  );
  return `[${converted}·····]`.replace("·····", "·".repeat(Math.ceil(value.length * 0.3)));
}

export function pseudoize(bundle: unknown): unknown {
  if (typeof bundle === "string") return pseudoizeString(bundle);
  if (Array.isArray(bundle)) return bundle.map(pseudoize);
  if (bundle && typeof bundle === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(bundle as Record<string, unknown>)) out[k] = pseudoize(v);
    return out;
  }
  return bundle;
}

export function resolveSourceLocale(locale: string): string {
  return locale === PSEUDO_LOCALE ? FALLBACK_LOCALE : locale;
}
