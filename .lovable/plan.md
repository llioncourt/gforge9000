# Campaign Media section

## Goal
Replace the separate campaign-level **Intro** and **Soundtrack** sections with one **Media** section containing three internal tabs: **Videos**, **Soundtrack**, and **Sound FX**.

## What will change
- Replace the current top-level Intro and Soundtrack tabs with one Media tab, while keeping the mandatory Intro gate active everywhere in the campaign.
- Build a responsive Media panel with the same internal tab style and horizontal overflow behavior used elsewhere.
- Expand Videos from one campaign intro into a video library:
  - GM upload with title and type selector.
  - Types: Intro, Recap, Cutscene, Trailer, Handout, Vision, Dream, Other.
  - Compact list rows with thumbnail, title, type, duration, play, and delete.
  - Allow only one active Intro; only that Intro retains first-entry blocking and “don’t show again” behavior.
  - Other videos remain optional and play from the Videos tab.
- Keep Soundtrack behavior and its persistent synchronized player unchanged inside the new Soundtrack tab.
- Add Sound FX:
  - GM-only audio upload, title, list, one-shot play, and delete.
  - No persistent/visible player for effects.
  - Triggered effects play immediately for every campaign member currently inside the campaign or its related character/lore pages.
  - Re-triggering the same effect creates a new playback event; it does not alter or pause soundtrack playback.
- Extend campaign ZIP import/package documentation so Videos and Sound FX are part of the campaign’s portable structure, while continuing to accept the existing `intro` field for compatibility.

## Technical details
- Migrate the single-row intro model into a multi-video model without losing existing intros or prior “don’t show again” choices.
- Add a private Sound FX table and storage with campaign-member reads, GM-only writes, explicit grants, and realtime playback events.
- Reuse the existing campaign scope detection and signed private-media URLs.
- Use unique storage paths, `FileDropzone`, project dialogs, and existing semantic design tokens.
- Add focused tests for video validation/types, Intro gate selection, Sound FX validation, package validation, and import compatibility.
- Verify typecheck, unit tests, build, and desktop/mobile campaign interactions.
