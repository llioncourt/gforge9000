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
import enDashboard from "./locales/en/dashboard.json";
import ptDashboard from "./locales/pt-BR/dashboard.json";
import enLibrary from "./locales/en/library.json";
import ptLibrary from "./locales/pt-BR/library.json";
import enSettings from "./locales/en/settings.json";
import ptSettings from "./locales/pt-BR/settings.json";
import enPacks from "./locales/en/packs.json";
import ptPacks from "./locales/pt-BR/packs.json";
import enCharacters from "./locales/en/characters.json";
import ptCharacters from "./locales/pt-BR/characters.json";
import enCampaigns from "./locales/en/campaigns.json";
import ptCampaigns from "./locales/pt-BR/campaigns.json";
import enLore from "./locales/en/lore.json";
import ptLore from "./locales/pt-BR/lore.json";

type MetaBundle = Record<string, unknown>;

const BUNDLES: Record<string, Record<string, MetaBundle>> = {
  marketing: { en: enMarketing as MetaBundle, "pt-BR": ptMarketing as MetaBundle },
  auth: { en: enAuth as MetaBundle, "pt-BR": ptAuth as MetaBundle },
  dashboard: { en: enDashboard as MetaBundle, "pt-BR": ptDashboard as MetaBundle },
  library: { en: enLibrary as MetaBundle, "pt-BR": ptLibrary as MetaBundle },
  settings: { en: enSettings as MetaBundle, "pt-BR": ptSettings as MetaBundle },
  packs: { en: enPacks as MetaBundle, "pt-BR": ptPacks as MetaBundle },
  characters: { en: enCharacters as MetaBundle, "pt-BR": ptCharacters as MetaBundle },
  campaigns: { en: enCampaigns as MetaBundle, "pt-BR": ptCampaigns as MetaBundle },
  lore: { en: enLore as MetaBundle, "pt-BR": ptLore as MetaBundle },
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
export function metaText(
  namespace:
    | "marketing"
    | "auth"
    | "dashboard"
    | "library"
    | "settings"
    | "packs"
    | "characters"
    | "campaigns"
    | "lore",
  path: string,
  vars?: Record<string, string | number>,
): string {
  const locale = normalizeLocale(detectLocale());
  const bundles = BUNDLES[namespace];
  const raw = lookup(bundles?.[locale], path) ?? lookup(bundles?.["en"], path) ?? "";
  if (!vars) return raw;
  return Object.entries(vars).reduce(
    (acc, [key, value]) => acc.replaceAll(`{{${key}}}`, String(value)),
    raw,
  );
}

/** Locale tag to advertise in metadata (`og:locale` uses underscores). */
export function metaLocale(): string {
  return normalizeLocale(detectLocale()).replace("-", "_");
}
