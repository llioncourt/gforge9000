import { describe, expect, it } from "vitest";
import { CAMPAIGN_PACKAGE_EXAMPLE } from "@/lib/campaign-package-docs";
import {
  parseCampaignPackageManifest,
  referencedFiles,
  validateCampaignPackage,
} from "@/lib/campaign-package";

describe("campaign package format", () => {
  const manifest = parseCampaignPackageManifest(CAMPAIGN_PACKAGE_EXAMPLE);

  it("parses the documented example", () => {
    expect(manifest.campaign.name).toBe("Ashes of the Frontier");
    expect(manifest.lore.entities).toHaveLength(2);
    expect(manifest.maps[0]?.objects[0]?.entity_key).toBe("npc:sergeant-vale");
  });

  it("accepts the example cross-references", () => {
    expect(validateCampaignPackage(manifest)).toEqual([]);
  });

  it("lists every referenced file", () => {
    expect(referencedFiles(manifest)).toEqual(
      expect.arrayContaining([
        "intro/intro.mp4",
        "assets/colony-map.png",
        "maps/landing-pad.png",
        "images/vale.jpg",
        "soundtracks/cover.jpg",
        "characters/sergeant-vale.json",
      ]),
    );
  });

  it("rejects a wrong format marker", () => {
    expect(() => parseCampaignPackageManifest('{"format":"nope","version":1}')).toThrow();
  });

  it("reports unknown keys and broken links", () => {
    const broken = parseCampaignPackageManifest(
      JSON.stringify({
        format: "ucf-campaign-package",
        version: 1,
        campaign: { name: "Test" },
        lore: {
          entities: [{ key: "a", kind: "npc", name: "A", parent_key: "missing" }],
          relationships: [],
        },
      }),
    );
    expect(validateCampaignPackage(broken)[0]).toContain("unknown parent_key");
  });
});
