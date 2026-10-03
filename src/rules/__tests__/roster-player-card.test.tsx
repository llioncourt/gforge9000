// @vitest-environment jsdom
/**
 * The roster card as players see it: portrait and name, nothing else, keeping
 * the footprint of the card it replaces. Guards against stats, approval badges
 * or GM actions creeping back into the player-facing roster.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import type { ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/* ---------- module doubles (everything else is the real thing) ---------- */

vi.mock("@/i18n/hooks", () => ({
  useT: () => ({ t: (key: string) => key }),
}));

// Keeps the portrait helper (and the image-conversion server fn behind it) out
// of the render while still giving the frame a signed URL to show.
vi.mock("@/lib/portrait", () => ({
  PORTRAIT_BUCKET: "portraits",
  portraitUrl: async (path: string | null) => (path ? `https://signed.test/${path}` : null),
  portraitInitials: (name: string) => name.slice(0, 2).toUpperCase(),
  uploadPortrait: vi.fn(),
  removePortrait: vi.fn(),
  validatePortraitFile: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    params,
    search,
    className,
    children,
  }: {
    to: string;
    params: { id: string };
    search: { from: string };
    className: string;
    children: ReactNode;
  }) =>
    createElement(
      "a",
      { href: `${to}/${params.id}`, "data-from": search.from, className },
      children,
    ),
}));

const { RosterPlayerCard } = await import("@/components/campaign/roster-player-card");

function renderCard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    createElement(
      QueryClientProvider,
      { client },
      createElement(RosterPlayerCard, {
        campaignId: "camp-1",
        tab: "roster",
        character: { id: "char-9", name: "Baltazar Fragoso", portrait_path: "u9/char-9/p.avif" },
      }),
    ),
  );
}

afterEach(cleanup);

describe("roster card as players see it", () => {
  it("shows the name and the portrait and nothing else", async () => {
    const { container } = renderCard();
    expect(await screen.findByText("Baltazar Fragoso")).toBeTruthy();
    // No HP/FP, no attribute grid, no point summary, no approval badge.
    expect(container.textContent?.trim()).toBe("Baltazar Fragoso");
    expect(container.querySelector("img")).toBeTruthy();
    expect(container.querySelectorAll("button")).toHaveLength(0);
    expect(container.querySelectorAll('[role="combobox"]')).toHaveLength(0);
  });

  it("keeps the card's footprint and its way back to the sheet", async () => {
    const { container } = renderCard();
    await screen.findByText("Baltazar Fragoso");
    const link = container.querySelector("a");
    expect(link).toBeTruthy();
    // Same height the roster card has today, so the board doesn't change shape.
    expect(link!.getAttribute("class")).toContain("h-[203px]");
    expect(link!.getAttribute("href")).toContain("char-9");
    expect(link!.getAttribute("data-from")).toBe("campaign:camp-1:roster");
  });
});
