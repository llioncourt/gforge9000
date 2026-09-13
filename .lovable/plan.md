# Campaign soundtrack

## Goal
Add a **Soundtrack** area to each campaign. The GM imports the same ZIP package used by Silicon Studios (`album.json`, AVIF cover, and audio tracks), controls playback for everyone, and a compact player remains active across every page belonging to that campaign. Opening anything outside the campaign stops and destroys playback locally.

## What will be built
- Add a Soundtrack tab with:
  - GM-only ZIP drop zone and package validation.
  - Album artwork and ordered track lists.
  - Play/pause, previous, next, seek, and volume controls.
  - Album removal with a styled confirmation dialog.
- Add a compact persistent player visible on the campaign page, its lore/NPC pages, and character sheets linked to that campaign.
- Synchronize the GM's selected track, play/pause state, and position live for campaign members.
- Stop and clear the audio player when navigating to a page that does not belong to the active campaign.

## Import rules
- Reuse Silicon Studios soundtrack pack version 1.
- Require `album.json` at the ZIP root, one AVIF cover, and 1–60 audio tracks.
- Accept MP3, OGG, Opus, and M4A audio, with the same metadata and size validation.
- Store soundtrack files privately; only campaign members can listen, and only the GM can import or remove albums.

## Technical details
- Add campaign soundtrack album, track, and live playback-state records with campaign-scoped access rules and live updates.
- Add a private soundtrack storage area with campaign-member read access and GM-only writes.
- Parse and validate ZIP packages in the browser, upload each declared file, then finalize the album only after every upload succeeds.
- Mount one audio provider at the authenticated app shell. Resolve the campaign from campaign, lore/NPC, and character pages so navigation inside that campaign does not interrupt playback.
- Use signed media URLs, browser audio, and periodic drift correction for synchronized listeners. Volume remains personal per browser.
- Add focused tests for manifest validation, route-to-campaign scope, synchronization timing, and teardown outside campaign scope.

## Verification
- Typecheck, unit tests, production build, and authenticated browser checks.
- Verify GM import, member playback synchronization, tab/page navigation persistence, and immediate teardown after leaving campaign-related pages.
