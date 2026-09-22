# GF9 MCP domain tool contract (internal build note)

You are implementing ONE file under `src/lib/mcp/domains/`. Read these first:

- `src/lib/mcp/kit.server.ts` — shared helpers (READ THIS FULLY, it is your API)
- `src/lib/mcp/uploads.server.ts` — shared file intake helpers (only if your domain uploads files)
- `src/lib/mcp/tools.server.ts` — the 23 existing tools; copy their style exactly
- `src/integrations/supabase/types.ts` — generated table types

## File shape

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

Note: a domain tool mixes read and write actions, so its annotations are
`readOnlyHint: false, destructiveHint: true, idempotentHint: false` unless
every action in the domain is read-only.

## Hard rules

1. **No service role.** Only `ctx.supabase` (the caller's RLS-scoped client) and
   `ctx.userId`. Never import `client.server`.
2. **Explicit authorization on every mutation**, on top of RLS. Use
   `loadCampaign(ctx, id)` + `requireGmFor(campaign, "…")`, `isCampaignMember`,
   `loadCharacter` + `requireCharacterWrite`, or a narrow RPC. Never widen what
   the app already allows; the MCP must never be a bypass for a player caller.
3. **Response contract, always via the kit helpers:**
   - list actions → `listReply(label, items, total)` with an EXACT total from a
     `{ count: "exact", head: true }` query using the identical filters.
   - detail / create / update → `detailReply(summaryLine, item)`
   - delete → `deleteReply(summaryLine, id)`
   Never hand-build `content`/`structuredContent`.
4. **Never leak GM-only data.** If your table has GM-only columns, strip them
   for non-GM callers with `stripGmFields`.
5. **Reuse existing app logic** (constants, validators, allowed value lists)
   rather than re-deriving them. Import from `src/lib/*` / `src/rules/*` when the
   module is server-safe (no React, no browser API at module scope). If a module
   imports `@/integrations/supabase/client`, DO NOT import it — copy only the
   plain constants/validators into your file with a comment naming the source.
6. **Validation messages name the field and its range**, e.g.
   `"size must be a number between 0.1 and 20"`. Use `intField(min,max,label)`.
7. **Patch semantics:** omitted fields unchanged; explicit `null` clears a
   nullable column. Use `buildPatch` + `requirePatch`.
8. TypeScript is strict with `noPropertyAccessFromIndexSignature`; use
   bracket access on index-signature types. No `any` without an eslint comment
   explaining why. Prettier: 100 cols, double quotes, semicolons, trailing commas.
9. Tables newer than the generated types: use `anyDb(ctx.supabase)` from the kit.
10. Comments explain WHY, not what. No emoji. English only.

## Uploads (media domains only)

Offer all four: `prepare_upload`, `finalize_upload`, `upload_from_url`,
`upload_base64`, using `src/lib/mcp/uploads.server.ts`. All buckets stay
private; only ever return short-lived signed URLs, and only after authorizing
the caller. Enforce the bucket's existing byte limit and MIME allow-list.
