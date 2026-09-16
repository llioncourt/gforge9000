# Fix "Reveal" and make visibility consistent everywhere

## What is actually wrong

I checked the live data and found the real cause, and it is worse than a UI glitch:

Your lore records store **two different vocabularies** for visibility. The app's access rules only
understand one of them.

- 35 records say `gm` and 15 say `players` (the words used by the ZIP import/export format)
- 13 say `GM_ONLY`, 1 says `ALL_PLAYERS`, 1 says `SELECTED_PLAYERS` (the words the app and the
  database access rules use)
- Relationships have the same split: 13 `gm`, 14 `players`

Consequences seen today:

1. A record marked `players` by the ZIP import is **still invisible to players**, because the access
   rule only accepts `ALL_PLAYERS` / `PUBLIC`.
2. Pressing **Reveal** only writes a "this player may see it" grant. It never changes the record's
   visibility. The access rule honours grants **only** when the record is set to
   *Selected players* — so revealing a `GM only` record does nothing, which is exactly what you hit.
3. Because the player could not read the record, the page they opened rendered empty — the blank
   panels in your screenshot.
4. The badge shows "GM ONLY" for unknown values like `players`, so the card looked untouched.

## What I will do

### 1. One vocabulary, enforced

- Create a single shared definition of visibility values (`GM_ONLY`, `UNREVEALED`,
  `SELECTED_PLAYERS`, `ALL_PLAYERS`, `PUBLIC`) with a `normalize()` helper that maps legacy words
  (`gm`, `players`, `public`, `private`, `shared`) onto them.
- Database migration: rewrite existing rows in `entities` and `entity_relationships`
  (`gm` → `GM_ONLY`, `players` → `ALL_PLAYERS`, `public` → `PUBLIC`), then add a CHECK constraint so
  a bad value can never be stored again.
- ZIP import converts incoming words to canonical values before writing; ZIP export keeps writing the
  friendly words so existing packages stay compatible. Package docs updated to list both.

### 2. Reveal actually reveals

Reworking the reveal flow so it does what its name says:

- Revealing a record to a player promotes it to **Selected players** automatically when it is
  currently `GM only` or `Unrevealed`, so the grant takes effect immediately.
- If the record is already `All players` / `Public`, the button explains that everyone already sees
  it, instead of silently adding a useless grant.
- Removing the last reveal offers to send the record back to `GM only`.
- The **Reveals** tab on the record page sends the same bell/toast/device notification the Players
  panel already sends (today it sends none).
- Both reveal surfaces show the record's current visibility next to the button so the state is never
  a surprise.

### 3. Every card that shows visibility

Audit and normalise the badge on all cards that carry visibility — World & Lore, Story, Timeline,
Sessions, notes, assets, battle maps — so legacy values are colour-coded correctly (a `players`
record shows green "All players", not red "GM only"), still GM-only, and always read from the same
helper rather than raw text.

### 4. Verification

- Unit tests for normalisation, the reveal promotion rule, and badge colour mapping.
- A live check: reveal one record to a player account and confirm the player sees the record, the
  bell fires, and the page renders with content.

## Technical notes

- New `src/lib/visibility.ts`: canonical values, `normalizeVisibility()`, `isPlayerVisible()`,
  labels; `entity-kinds.ts` re-exports from it to avoid a second source of truth.
- Migration: `UPDATE ... SET visibility = ...` for both tables + `CHECK (visibility IN (...))`.
  Existing RLS policies stay unchanged; they already implement the right logic.
- `grantKnowledge` callers in `players-panel.tsx` and `entities.$id.tsx` go through one shared
  `revealEntityToPlayer()` helper (grant + optional visibility promotion + notification).
- `visibility-badge.tsx` uses `normalizeVisibility()` instead of its local value sets.
