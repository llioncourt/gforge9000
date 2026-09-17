import type { AdaptationManifest } from "@/lib/adaptation/protocol";

/** README shipped inside every adaptation bundle. */
export function buildAdaptationReadme(manifest: AdaptationManifest): string {
  const comic = manifest.targets.comic;
  const movie = manifest.targets.movie;
  return `# ${manifest.adaptation.name}

Adaptation of the campaign **${manifest.source_campaign.name}**, exported ${manifest.exported_at}.

## What is in this file

| Path | Contents |
| --- | --- |
| \`adaptation.json\` | The complete adaptation: facts, scenes, bibles, assets and target projections. |
| \`assets/\` | The pictures, maps, audio and video referenced by the adaptation. |

Format: \`${manifest.format}\` version ${manifest.version}.

## Contents at a glance

- Scenes: ${manifest.scenes.length}
- Facts: ${manifest.facts.length} (${manifest.facts.filter((f) => f.canon_status === "confirmed").length} confirmed, ${manifest.conflicts.length} conflicts)
- Cast: ${manifest.cast.length} · Locations: ${manifest.locations.length} · Props: ${manifest.props.length}
- Files: ${manifest.assets.length}
- Comic projection: ${comic ? `${comic.target_projection.pages.length} pages` : "not included"}
- Film projection: ${movie ? `${movie.target_projection.scenes.length} scenes` : "not included"}

## How to read it

Every fact and every scene carries \`source_refs\` pointing back at the campaign
record it came from, and a \`provenance_type\`:

- \`campaign_canon\` — stated outright in the campaign.
- \`session_derived\` — taken from what happened at the table.
- \`ai_inference\` — inferred, and reviewed before export.
- \`adaptation_created\` — invented for this retelling only.
- \`conflict\` — sources disagree; nothing was decided for you.

\`sync\` lists the fingerprint of every source record. Re-importing the same
campaign later compares those fingerprints to show exactly what changed.

This file does not replace the campaign package: it is a derived retelling and
always points back to its origin.
`;
}
