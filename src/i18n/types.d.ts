import type common from "./locales/en/common.json";
import type navigation from "./locales/en/navigation.json";
import type errors from "./locales/en/errors.json";
import type auth from "./locales/en/auth.json";
import type dashboard from "./locales/en/dashboard.json";
import type characters from "./locales/en/characters.json";
import type campaigns from "./locales/en/campaigns.json";
import type lore from "./locales/en/lore.json";
import type media from "./locales/en/media.json";
import type library from "./locales/en/library.json";
import type packs from "./locales/en/packs.json";
import type rules from "./locales/en/rules.json";
import type settings from "./locales/en/settings.json";
import type battle from "./locales/en/battle.json";
import type dice from "./locales/en/dice.json";
import type marketing from "./locales/en/marketing.json";
import type adaptation from "./locales/en/adaptation.json";
import type assistant from "./locales/en/assistant.json";

/**
 * English is the source of truth for key typing: `t("actions.save")` is
 * autocompleted and invalid keys fail the typecheck.
 */
declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "common";
    resources: {
      common: typeof common;
      navigation: typeof navigation;
      errors: typeof errors;
      auth: typeof auth;
      dashboard: typeof dashboard;
      characters: typeof characters;
      campaigns: typeof campaigns;
      lore: typeof lore;
      media: typeof media;
      library: typeof library;
      packs: typeof packs;
      rules: typeof rules;
      settings: typeof settings;
      battle: typeof battle;
      dice: typeof dice;
      marketing: typeof marketing;
      adaptation: typeof adaptation;
      assistant: typeof assistant;
    };
  }
}

export {};
