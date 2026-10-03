// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  OtherPlayerRosterCard,
  shouldUseOtherPlayerRosterCard,
} from "@/components/campaign/other-player-roster-card";

vi.mock("@/components/character/card-portrait-bg", () => ({
  CardPortraitBg: ({ path }: { path: string | null }) => (
    <span data-testid="portrait-background">{path}</span>
  ),
}));

afterEach(cleanup);

describe("other-player roster card", () => {
  it("is used only for another player's non-NPC character", () => {
    expect(
      shouldUseOtherPlayerRosterCard({
        isGm: false,
        isNpc: false,
        ownerId: "other-player",
        viewerId: "viewer",
      }),
    ).toBe(true);
    expect(
      shouldUseOtherPlayerRosterCard({
        isGm: false,
        isNpc: false,
        ownerId: "viewer",
        viewerId: "viewer",
      }),
    ).toBe(false);
    expect(
      shouldUseOtherPlayerRosterCard({
        isGm: true,
        isNpc: false,
        ownerId: "other-player",
        viewerId: "viewer",
      }),
    ).toBe(false);
    expect(
      shouldUseOtherPlayerRosterCard({
        isGm: false,
        isNpc: true,
        ownerId: "other-player",
        viewerId: "viewer",
      }),
    ).toBe(false);
  });

  it("shows only the character name, player name, and portrait background", () => {
    const { container } = render(
      <OtherPlayerRosterCard
        characterName="Alie River"
        playerName="Bruno"
        portraitPath="owner/character/portrait.avif"
      />,
    );

    expect(screen.getByRole("heading", { name: "Alie River" })).toBeTruthy();
    expect(screen.getByText("Bruno")).toBeTruthy();
    expect(screen.getByTestId("portrait-background").textContent).toBe(
      "owner/character/portrait.avif",
    );
    expect(container.querySelectorAll("button, a, [role=badge]")).toHaveLength(0);
  });
});