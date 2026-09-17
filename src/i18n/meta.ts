/**
 * Localized page metadata for route `head()` functions.
 *
 * `head()` runs outside React, so it cannot use hooks. The small metadata
 * sections of the public namespaces are therefore imported statically (a few
 * hundred bytes per locale) and resolved against the locale detected for the
 * current request, which keeps server-rendered <title>/<meta> in the user's
 * language without any runtime fetch.
 */
import { normalizeLocale } from "./config";
import { detectLocale } from "./detect";
import enMarketing from "./locales/en/marketing.json";
import ptMarketing from "./locales/pt-BR/marketing.json";
import enAuth from "./locales/en/auth.json";
import ptAuth from "./locales/pt-BR/auth.json";

type MetaBundle = Record<string, unknown>;

const BUNDLES: Record<string, Record<string, MetaBundle>> = {
  marketing: { en: enMarketing as MetaBundle, "pt-BR": ptMarketing as MetaBundle },
  auth: { en: enAuth as MetaBundle, "pt-BR": ptAuth as MetaBundle },
};

function lookup(bundle: MetaBundle | undefined, path: string): string | undefined {
  if (!bundle) return undefined;
  let current: unknown = bundle;
  for (const part of path.split(".")) {
    if (typeof current !== "object" || current === null) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === "string" ? current : undefined;
}

/**
 * Reads a metadata string for the current locale, falling back to English.
 * Returns an empty string only if the key is missing in every locale.
 */
export function metaText(namespace: "marketing" | "auth", path: string): string {
  const locale = normalizeLocale(detectLocale());
  const bundles = BUNDLES[namespace];
  return lookup(bundles?.[locale], path) ?? lookup(bundles?.["en"], path) ?? "";
}

/** Locale tag to advertise in metadata (`og:locale` uses underscores). */
export function metaLocale(): string {
  return normalizeLocale(detectLocale()).replace("-", "_");
}
