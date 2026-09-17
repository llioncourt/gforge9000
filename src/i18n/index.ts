import i18next, { type i18n as I18nInstance, type Resource } from "i18next";
import { initReactI18next } from "react-i18next";
import {
  CORE_NAMESPACES,
  DEFAULT_LOCALE,
  FALLBACK_LOCALE,
  PSEUDO_LOCALE,
  SUPPORTED_LOCALE_CODES,
  normalizeLocale,
} from "./config";
import { coreResources, loadNamespace, pseudoize, resolveSourceLocale } from "./resources";

const isDev = import.meta.env?.DEV === true;
const warned = new Set<string>();

function devWarn(message: string) {
  if (!isDev) return;
  if (warned.has(message)) return;
  warned.add(message);
  console.warn(`[i18n] ${message}`);
}

/**
 * Last-resort visible fallback. A raw key (`lore.actions.revealEntity`) must
 * never reach the screen, so we humanize the last segment instead.
 */
export function humanizeKey(key: string): string {
  const last = key.split(".").pop() ?? key;
  const spaced = last
    .replace(/_/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim();
  if (!spaced) return "";
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

const backend = {
  type: "backend" as const,
  init() {},
  read(language: string, namespace: string, callback: (err: unknown, data: unknown) => void) {
    const source = resolveSourceLocale(language);
    loadNamespace(source, namespace)
      .then((data) => {
        if (!data) {
          devWarn(`missing namespace file "${namespace}" for locale "${language}"`);
          callback(null, {});
          return;
        }
        callback(null, language === PSEUDO_LOCALE ? pseudoize(data) : data);
      })
      .catch((err) => {
        devWarn(`failed to load namespace "${namespace}" for "${language}": ${String(err)}`);
        callback(null, {});
      });
  },
};

function initialResources(locale: string) {
  const source = resolveSourceLocale(locale);
  const bundles = coreResources(source);
  const resources: Record<string, Record<string, unknown>> = {
    [locale]: locale === PSEUDO_LOCALE ? (pseudoize(bundles) as Record<string, unknown>) : bundles,
  };
  if (locale !== FALLBACK_LOCALE) {
    resources[FALLBACK_LOCALE] = coreResources(FALLBACK_LOCALE);
  }
  return resources;
}

/**
 * Creates a configured i18next instance. One instance per client session and
 * one per SSR render — never one per component.
 */
export function createI18nInstance(locale: string = DEFAULT_LOCALE): I18nInstance {
  const lng = normalizeLocale(locale);
  const instance = i18next.createInstance();

  void instance
    .use(backend)
    .use(initReactI18next)
    .init({
      lng,
      fallbackLng: FALLBACK_LOCALE,
      ns: CORE_NAMESPACES,
      defaultNS: "common",
      fallbackNS: "common",
      supportedLngs: SUPPORTED_LOCALE_CODES,
      resources: initialResources(lng) as Resource,
      partialBundledLanguages: true,
      interpolation: { escapeValue: false },
      returnNull: false,
      returnEmptyString: false,
      react: { useSuspense: true },
      parseMissingKeyHandler: (key: string) => {
        devWarn(`missing translation for key "${key}"`);
        return humanizeKey(key);
      },
      missingKeyHandler: (_lngs, ns, key) => {
        devWarn(`missing key "${key}" in namespace "${ns}"`);
      },
      saveMissing: isDev,
      debug: false,
    });

  return instance;
}
