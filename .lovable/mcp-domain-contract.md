# GF9 MCP domain tool contract (internal build note)

You are implementing or changing a file under `src/lib/mcp/domains/`. Read these first:

- `src/lib/mcp/kit.server.ts` — shared helpers (READ THIS FULLY, it is your API)
- `src/lib/mcp/domains/shared.server.ts` — helpers shared by campaigns/entries/
  relationships/characters/character-entries
- `src/lib/mcp/domains/index.server.ts` — the single tool registry (see below)
- `src/lib/mcp/uploads.server.ts` — shared file intake helpers (only if your domain uploads files)
- `src/integrations/supabase/types.ts` — generated table types

## Architecture: single registry, no second tool list

`src/lib/mcp/domains/index.server.ts` is the ONLY place that lists tool
registrars. It exports:

- `registerAllTools(tool, ctx)` — calls every domain's `registerXxx` in order.
- `MCP_TOOL_NAMES` — derived by running that exact same list of registrars
  against a name-collecting fake `ToolRegistrar`, not hand-written.

`src/lib/mcp/tools.server.ts` is a thin composition root: it builds the
`McpServer`, calls `registerAllTools`, and re-exports `MCP_TOOL_NAMES`,
`MCP_GM_ONLY_FIELDS`, `__stripGmFields` and `buildMcpServer` so existing
importers keep working unchanged. It must never itself define a tool or a
second `MCP_TOOL_NAMES`-like list.

Adding a tool means: write (or extend) one `src/lib/mcp/domains/*.server.ts`
module exporting a `registerXxx(tool, ctx)` function, then add that function
to the `REGISTRARS` array in `index.server.ts`. Nothing else needs to change
for the name to become part of `MCP_TOOL_NAMES`.

## Public contract stability

The public MCP surface is 39 top-level tool names, frozen:

```
list_campaigns, get_campaign, create_campaign, update_campaign, delete_campaign,
list_entry_types, list_entries, get_entry, create_entry, update_entry, delete_entry,
list_relationships, create_relationship, update_relationship, delete_relationship,
list_characters, get_character, create_character, update_character, delete_character,
add_character_entry, update_character_entry, delete_character_entry,
campaign_members, campaign_knowledge, campaign_notifications, campaign_notes,
session_chronicles, history, maps, dice, character_runtime, campaign_assets,
campaign_audio, campaign_videos, character_portrait, library, campaign_package,
adaptation
```

Changes to this list, to any action within a domain tool, to any schema, to
any response shape, or to any description are **additive only**:

- New tools, new domain actions, new optional input fields, and new optional
  output fields are allowed.
- Removing a tool or action, renaming a field, tightening a previously
  accepted input, or changing an existing response shape is a breaking change
  and is out of scope for a routine PR — it needs an explicit product
  decision.
- The one deliberate exception already shipped: `create_campaign` and
  `update_campaign` gained an additive, optional `quirk_limit` setting
  alongside `point_limit`, `disadvantage_limit`, `tech_level`, etc. Its
  numeric range comes from `src/lib/campaign-settings.ts`
  (`CAMPAIGN_SETTING_RANGES`), the single source shared with the
  UCF-CAMPAIGN-PACKAGE v1 schema in `src/lib/campaign-package.ts`, so the two
  can never drift the way `quirk_limit` once did.

A regression test (`src/rules/__tests__/mcp-tools.test.ts`) asserts the
registered tool set is exactly these 39 names; keep it passing.

## Authorization / RLS

1. **No service role.** Only `ctx.supabase` (the caller's RLS-scoped client)
   and `ctx.userId`. Never import `client.server` from an MCP domain module.
2. **Explicit authorization on every mutation**, on top of RLS. Use
   `loadCampaign(ctx, id)` + `requireGm`/`requireGmFor(campaign, "…")`,
   `isCampaignMember`, `loadCharacter` + `requireCharacterWrite`
   /`requireCharacterOwner`, or a narrow RPC. Never widen what the app already
   allows; the MCP must never be a bypass for a player caller.
3. **Never leak GM-only data.** GM-only columns (`gm_notes`, `gm_description`)
   are stripped for non-GM callers with `stripGmFields`
   (`MCP_GM_ONLY_FIELDS` in `shared.server.ts` names them for tests).
4. Server construction is stateless per request: `buildMcpServer(ctx)` takes
   the request's own RLS-scoped `ctx` and builds a fresh server bound to it.
   The only thing cached across requests is the immutable JSON Schema
   conversion of each tool's zod schema (`withJson` in `kit.server.ts`, keyed
   by schema object identity in a module-level `WeakMap`) — never request or
   user state.

## Uploads: legacy `upload_from_url` actions stay registered but fail closed

The legacy remote-URL upload actions — `campaign_assets.upload_from_url`,
`maps.upload_image_from_url`, `campaign_videos.upload_from_url`,
`character_portrait.upload_from_url` — **remain registered** for backward
compatibility. They are part of the frozen public contract: **do not remove
or rename them.** Any MCP client that already calls one of these actions must
keep getting a recognized action name back, not a "no such action" error.

What changes is their *behavior*, not their existence: each one **must fail
closed** with a clear, security-labeled error (see `TD-002` comments next to
each handler in `campaign-assets.server.ts`, `maps.server.ts`,
`campaign-videos.server.ts`, `character-portrait.server.ts`) instead of
performing a server-side fetch. They fail this way because a server-side
fetch of an arbitrary caller-supplied URL is an SSRF vector against internal
services and cloud metadata endpoints, and this runtime cannot guarantee
resolve-then-pin DNS/TLS safety (resolve the hostname, pin the connection to
the resolved IP, and verify TLS against that same pinned IP) for an outbound
fetch to an arbitrary caller-supplied host. See `fetchRemoteFile` in
`src/lib/mcp/uploads.server.ts` for the details of why that guarantee isn't
achievable here today.

Rules for future changes:

- **Never remove or rename** these four actions. They must keep appearing in
  each domain tool's action union and description.
- **Never restore server-side arbitrary URL fetching** in these handlers (or
  add a new one elsewhere) unless the runtime can prove validated,
  pinned-DNS/TLS safety end to end. Until then they must keep throwing the
  clear security error instead of fetching anything.
- The **supported alternatives** are unchanged and must keep working: a
  short-lived signed upload the caller's own client performs
  (`prepare_upload` + `finalize_upload`), and inline `upload_base64` for small
  files. Neither makes the server fetch a caller-chosen network address. All
  buckets stay private; only ever return short-lived signed URLs, and only
  after authorizing the caller. Enforce the bucket's existing byte limit and
  MIME allow-list.
- The 39 top-level tool names (listed above) and every existing action name
  within them — including these four legacy actions — are preserved. This is
  additive-only territory: see "Public contract stability" above.

## Response contract

Always via the kit helpers, never hand-built `content`/`structuredContent`:

- list actions → `listReply(label, items, total)` with an EXACT total from a
  `{ count: "exact", head: true }` query using the identical filters.
- detail / create / update → `detailReply(summaryLine, item)`
- delete → `deleteReply(summaryLine, id)`

## Pack search semantics (`library` tool, `search_pack_entries` action)

`search_pack_entries` resolves matches through
`loadPackCandidatesDetailed` in `src/lib/pack-match.ts`. That scan:

- **Pages through every visible row** the caller is allowed to see (their own
  library entries plus campaign/public packs allowed for the context) —
  it must never apply a fixed pool cap that would silently hide matches
  past some arbitrary row count.
- Matches **case- and accent-insensitively** (diacritics are normalised
  away before comparing), so "café" matches "cafe" and "Café" alike.

Do not touch `src/lib/pack-match.ts` or the `search_pack_entries` action body
in `src/lib/mcp/domains/library.server.ts` without re-verifying both
properties still hold — they are covered by tests and by this contract.

## Other hard rules

1. **Reuse existing app logic** (constants, validators, allowed value lists)
   rather than re-deriving them. Import from `src/lib/*` / `src/rules/*` when
   the module is server-safe (no React, no browser API at module scope). If a
   module imports `@/integrations/supabase/client`, DO NOT import it — copy
   only the plain constants/validators into your file with a comment naming
   the source.
2. **Validation messages name the field and its range**, e.g.
   `"size must be a number between 0.1 and 20"`. Use `intField(min,max,label)`.
3. **Patch semantics:** omitted fields unchanged; explicit `null` clears a
   nullable column. Use `buildPatch` + `requirePatch`.
4. TypeScript is strict with `noPropertyAccessFromIndexSignature`; use
   bracket access on index-signature types. No `any` without an eslint comment
   explaining why. Prettier: 100 cols, double quotes, semicolons, trailing commas.
5. Tables newer than the generated types: use `anyDb(ctx.supabase)` from the kit.
6. Comments explain WHY, not what. No emoji. English only.

## Domain-tool file shape (mixed read/write, routed by `action`)

```ts
import { z } from "zod/v4";
import {
  CREATE, DESTROY, MODIFY, READ,
  actionRouter, deleteReply, detailReply, domainOutput, fail, limitField,
  listReply, loadCampaign, requireGmFor, isCampaignMember, uuid,
} from "@/lib/mcp/kit.server";
import type { McpToolContext, ToolRegistrar } from "@/lib/mcp/kit.server";

const input = z.discriminatedUnion("action", [
  z.object({ action: z.literal("list"), campaign_id: uuid, limit: limitField }),
  // ...one strict object per action, each with .describe() on the object
]);

export function registerXxx(tool: ToolRegistrar, ctx: McpToolContext): void {
  tool("xxx", {
    title: "…",
    description: "…", // MUST enumerate every action and MUST say plainly which actions change or delete data
    inputSchema: input,
    outputSchema: domainOutput,
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    }, actionRouter<z.infer<typeof input>>({
      list: async (i) => { /* … */ },
      // …
    }),
  );
}
```

A domain tool mixes read and write actions, so its annotations are
`readOnlyHint: false, destructiveHint: true, idempotentHint: false` unless
every action in the domain is read-only. Then add the new `registerXxx` to
`REGISTRARS` in `src/lib/mcp/domains/index.server.ts`.
