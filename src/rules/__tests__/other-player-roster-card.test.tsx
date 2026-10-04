// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  OtherPlayerRosterCard,
  shouldUseOtherPlayerRosterCard,
} from "@/components/campaign/other-player-roster-card";

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
        portraitUrl="https://example.com/portrait"
      />,
    );

    expect(screen.getByRole("heading", { name: "Alie River" })).toBeTruthy();
    expect(screen.getByText("Bruno")).toBeTruthy();
    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "https://example.com/portrait",
    );
    expect(container.querySelectorAll("button, a, [role=badge]")).toHaveLength(0);
  });
});
