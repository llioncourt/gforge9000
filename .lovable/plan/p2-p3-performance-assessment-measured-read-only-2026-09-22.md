# P2/P3 performance assessment (measured, read-only)

Nothing was changed. All numbers below come from running the app (signed-in session, same
machine, repeated runs) and from the database itself, not from reading code.

Scope note: this is entirely separate from the resolved renderer incident. None of the items
below can cause a "page isn't responding" dialog.

## Measured baseline

Published site, cold, signed out: landing 0.71s, sign-in page 0.50s, 324 KB of code, 169 page
elements, no console errors, no failed requests. Startup is healthy — there is no P0/P1 left.

Signed-in screens (local, real session, 5s settle):

| Screen | Wall | Data downloaded | Requests |
|---|---|---|---|
| Dashboard | 1.0-1.5s | 18 KB | 9 |
| Campaigns | ~0.3s | ~7 KB | 6 |
| Library | 3.0s | **5,249 KB** | 9 |

## 1. Duplicated session listeners — VERDICT: untidy, not costly (P3)

`src/hooks/use-session.ts`, used by 16 components.

Measured per page load: 9-11 separate sign-in listeners registered, 21-23 session reads
(8-10 of them from this hook). Every one of those reads is served from local storage:
**0.00 ms each, zero network calls** (measured directly: 20 consecutive reads averaged <0.01 ms).

- Affects: nothing measurable. No duplicated network calls, no race conditions observed, no
  extra fetches, no re-render storms (dashboard stays at 275 elements, library at 1,903).
- Worth fixing? Only as tidiness. A shared context would remove ~10 listeners but save ~0 ms.
- Risk: touching the session hook touches every screen. **Recommendation: leave it.**

## 2. One genuinely redundant network call per page — P2, cheap fix

`src/components/campaign/campaign-soundtrack-player.tsx` line ~103: on mount it asks the
server "who am I?" (`/auth/v1/user`) even on screens with no campaign.

Measured: **2 calls per page load, 1.7 KB and 118-185 ms each**, on Dashboard, Campaigns and
Library alike — screens that never play music. It is mounted app-wide by `app-shell.tsx`.

- Affects: navigation latency (not blocking, runs in parallel).
- Smallest safe correction: take the user id from the session already in memory instead of a
  server round trip (one-line change to use the existing session hook).
- Risk: very low; the id is identical, only the source changes.
- Why 2x: the effect is invoked twice during development double-mounting; production shows the
  same pair, so the fix removes both.

## 3. Library payload — P2, the only large item

`listLibrary()` in `src/lib/api.ts` (`select("*")`, two sequential pages of 1,000 rows).

Measured over the wire, 1,730 rows:

| Query | Size | Time |
|---|---|---|
| Everything (today) | **4.93 MB** | 1,563 ms |
| Everything except the hidden detail field | **2.30 MB** | 589 ms |
| List-only fields | 1.99 MB | 520 ms |

Field breakdown from the database (1,730 rows): detail field 2.78 MB, descriptions 1.56 MB,
names 26 KB, tags 42 KB. So **the single hidden detail field is 56% of the payload**, and the
descriptions — which are shown on the cards and are searched — are most of the rest.

Who consumes the detail field: only three actions, never the list itself — adding an entry to a
character sheet (Library screen and the sheet's pack picker), and exporting. Pack screens and
all search/filter/deep-link code use only name, category, description, tags, pack, source.

Proposed split (safe): the shared list query stops requesting the detail field; the three
actions that need it fetch it for the specific entries they touch, at the moment they run.

- Search, filters, sort: unaffected (they never read it).
- Deep links: unaffected (id-based).
- Editing: unaffected (the edit form never reads it; it is preserved untouched on update).
- Export: fetches the field for the exported rows first, so exported files stay byte-identical.
- Add-to-sheet: fetches the one entry it copies.
- Expected result: Library first paint ~1.0s faster, ~2.6 MB less per visit, lower memory.
- Risk: medium-low, confined to one query plus three call sites; export round-trip needs a test.

## 4. Library typing cost — P2, small fix, good payoff

Measured while typing 4 characters in the Library search: long main-thread tasks of
**339, 244, 160, 109 ms**. Two causes, both in `src/routes/_authenticated/library.tsx`:
re-ranking 1,730 rows per keystroke, and re-serialising the whole filtered set into export
format on every keystroke (the export payload is only needed when the user clicks Export).

- Smallest safe correction: compute the export payload only when exporting; debounce the search
  input by ~150 ms.
- Risk: low. Export output unchanged; search behaviour unchanged apart from a brief delay.

## 5. Route preloading — VERDICT: not a problem (no action)

Landing page pulls 51 code files / 324 KB in 0.71s and the router has link preloading disabled.
The cancelled requests seen earlier are the browser's own preload hints being superseded.
Nothing measurable to gain.

## 6. Sign-in page hydration warning — P3, not reproducible in production

Retested the published sign-in page in Portuguese and English: **zero console messages** in both.
The warning only appears in the development runtime log. No user-visible cost. Leave it.

## 7. Other items found while measuring

- Dashboard requests 5 separate signed image links per load (one per character card). Small
  (each a few ms) but they are re-signed on every visit; a cached signature would remove 5
  requests per navigation. P3.
- Two separate profile lookups per page (full profile + preferences), 0.4 KB total, ~80 ms in
  parallel. Merging them saves one request. P3.

## Ranked by measured user impact

1. **P2 — Library payload split** (4.93 MB → 2.30 MB, ~1.0s faster per visit).
2. **P2 — Library typing** (removes ~340 ms stalls per keystroke).
3. **P2 — Music player's server user lookup** (removes 2 round trips per page, ~150 ms each).
4. P3 — Merge the two profile lookups; cache signed image links.
5. P3 — No action: session listeners, route preloading, hydration warning.

## What I would do next, in order

Items 1-3 only, each with its own tests and a before/after measurement of the same sequence.
Items 4-5 deliberately left alone unless you ask — the risk outweighs the measured gain.
