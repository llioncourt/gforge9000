import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOCALE,
  FALLBACK_LOCALE,
  enabledLocales,
  getLocale,
  intlLocale,
  isSupportedLocale,
  localeDirection,
  normalizeLocale,
} from "@/i18n/config";
import { fromAcceptLanguage } from "@/i18n/detect";
import {
  formatBytes,
  formatCurrency,
  formatDate,
  formatDuration,
  formatNumber,
} from "@/i18n/format";
import { humanizeKey } from "@/i18n";

describe("locale registry", () => {
  it("exposes English as default and fallback", () => {
    expect(DEFAULT_LOCALE).toBe("en");
    expect(FALLBACK_LOCALE).toBe("en");
  });

  it("normalizes aliases and unknown tags", () => {
    expect(normalizeLocale("pt")).toBe("pt-BR");
    expect(normalizeLocale("pt-PT")).toBe("pt-BR");
    expect(normalizeLocale("en-US")).toBe("en");
    expect(normalizeLocale("pt-AO")).toBe("pt-BR");
    expect(normalizeLocale("ja-JP")).toBe("en");
    expect(normalizeLocale(null)).toBe("en");
  });

  it("knows which tags are supported", () => {
    expect(isSupportedLocale("pt-BR")).toBe(true);
    expect(isSupportedLocale("fr")).toBe(false);
  });

  it("is RTL ready through the registry", () => {
    expect(localeDirection("pt-BR")).toBe("ltr");
    expect(getLocale("pt-BR").fallback).toBe("en");
    expect(intlLocale("pt-BR")).toBe("pt-BR");
  });

  it("only offers enabled locales", () => {
    for (const locale of enabledLocales()) expect(locale.enabled).toBe(true);
  });
});

describe("accept-language negotiation", () => {
  it("picks the best supported language", () => {
    expect(fromAcceptLanguage("pt-BR,pt;q=0.9,en;q=0.8")).toBe("pt-BR");
    expect(fromAcceptLanguage("fr-FR,fr;q=0.9,en;q=0.5")).toBe("en");
    expect(fromAcceptLanguage("ja;q=0.9")).toBeNull();
    expect(fromAcceptLanguage(null)).toBeNull();
  });
});

describe("formatters", () => {
  it("formats numbers per locale", () => {
    expect(formatNumber("en", 1234.56)).toBe("1,234.56");
    expect(formatNumber("pt-BR", 1234.56)).toBe("1.234,56");
  });

  it("keeps currency independent from the interface language", () => {
    expect(formatCurrency("en", 10, "BRL")).toContain("10");
    expect(formatCurrency("pt-BR", 10, "USD")).toContain("10");
  });

  it("formats dates per locale", () => {
    const date = new Date(Date.UTC(2026, 0, 31, 12));
    expect(formatDate("en", date, "short")).not.toBe(formatDate("pt-BR", date, "short"));
    expect(formatDate("en", null)).toBe("");
  });

  it("formats byte sizes and durations", () => {
    expect(formatBytes("en", 2048)).toBe("2 KB");
    expect(formatDuration("en", 125)).toBe("2:05");
  });
});

describe("missing key protection", () => {
  it("never shows a raw key to the user", () => {
    expect(humanizeKey("lore.actions.revealEntity")).toBe("Reveal Entity");
    expect(humanizeKey("common.actions.save")).toBe("Save");
    expect(humanizeKey("delete_confirm")).toBe("Delete confirm");
  });
});
