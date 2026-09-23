/**
 * Shared building blocks for every assistant (MCP) tool.
 *
 * Everything here runs against the RLS-scoped Supabase client built from the
 * caller's own access token — there is no service-role access anywhere in the
 * MCP request path. On top of RLS, the application's own Game Master / owner
 * rules are checked explicitly so a write never depends on a policy alone.
 */

import { z } from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/** Hard ceiling on rows any single tool call may return. */
export const MCP_MAX_LIMIT = 200;
export const DEFAULT_LIMIT = 50;

export type Client = SupabaseClient<Database>;

export interface McpToolContext {
  supabase: Client;
  userId: string;
}

export type Structured = Record<string, unknown>;

/* ------------------------------------------------------------------ */
/* Errors                                                              */
/* ------------------------------------------------------------------ */

export function fail(operation: string, error: { message: string } | null): never {
  throw new Error(`${operation} failed: ${error?.message ?? "unknown error"}`);
}

/* ------------------------------------------------------------------ */
/* Field primitives                                                    */
/* ------------------------------------------------------------------ */

export const uuid = z.string().uuid();

export const limitField = z
  .number({ error: "limit must be an integer between 1 and 200" })
  .int({ error: "limit must be an integer between 1 and 200" })
  .min(1, { error: "limit must be an integer between 1 and 200" })
  .max(MCP_MAX_LIMIT, { error: "limit must be an integer between 1 and 200" })
  .optional();

export const boundedText = (max: number) => z.string().min(1).max(max);

/** Bounded integer with a message that names the field and its range. */
export const intField = (min: number, max: number, label?: string) => {
  const error = label
    ? `${label} must be an integer between ${min} and ${max}`
    : `Must be an integer between ${min} and ${max}`;
  return z.number({ error }).int({ error }).min(min, { error }).max(max, { error });
};

/** Deltas move in exact quarter steps. */
export const quarterStep = z
  .number()
  .refine((value) => Number.isFinite(value) && Number.isInteger(value * 4), {
    message: "speed_delta must be a multiple of 0.25",
  });

export const jsonRecord = z.record(z.string(), z.unknown());

/* ------------------------------------------------------------------ */
/* Response contracts                                                  */
/* ------------------------------------------------------------------ */

export const listOutput = z.object({
  count: z.number().int(),
  total: z.number().int(),
  truncated: z.boolean(),
  items: z.array(z.record(z.string(), z.unknown())),
});
export const itemOutput = z.object({ item: z.record(z.string(), z.unknown()) });
export const deleteOutput = z.object({ deleted: z.boolean(), id: z.string() });

export function reply(text: string, structuredContent: Structured) {
  return {
    content: [{ type: "text" as const, text }],
    structuredContent,
  };
}

/**
 * List response contract: a "showing N of M" summary line, a blank line, then
 * the complete safe list as pretty JSON. `total` is an exact count taken with
 * the very same visibility and filters as the listed rows.
 */
export function listReply(
  label: string,
  items: Structured[],
  total: number,
  /** Optional extra top-level fields (additive; e.g. a campaign's playback block). */
  extra?: Structured,
) {
  const count = items.length;
  const truncated = count < total;
  const summary = `Showing ${count} of ${total} ${label}${
    truncated ? " (more may exist — raise limit)" : ""
  }.`;
  const body = extra ? { items, ...extra } : items;
  return reply(`${summary}\n\n${JSON.stringify(body, null, 2)}`, {
    count,
    total,
    truncated,
    items,
    ...(extra ?? {}),
  });
}

/**
 * Single place enforcing the detail response contract: one summary line, a
 * blank line, then the complete safe object as pretty JSON — and the very same
 * object as structured content.
 */
export function detailReply(summary: string, item: Structured) {
  return reply(`${summary}\n\n${JSON.stringify(item, null, 2)}`, { item });
}

export function deleteReply(summary: string, id: string) {
  const payload = { deleted: true, id };
  return reply(`${summary}\n\n${JSON.stringify(payload, null, 2)}`, payload);
}

/* ------------------------------------------------------------------ */
/* Patch helpers                                                       */
/* ------------------------------------------------------------------ */

/** Drops keys the caller did not send; explicit `null` is kept (it clears). */
export type Patch<T> = { [K in keyof T]?: Exclude<T[K], undefined> };

export function buildPatch<T extends Record<string, unknown>>(patch: T): Patch<T> {
  return Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  ) as Patch<T>;
}

/**
 * Cast for an insert/update payload whose undefined keys have already been
 * dropped at runtime. supabase-js types payloads under
 * `exactOptionalPropertyTypes`, which rejects `X | undefined` optionals even
 * once they can no longer be present.
 */
export function dbPayload<T>(value: object): T {
  return value as T;
}

export function requirePatch(update: Record<string, unknown>): void {
  if (Object.keys(update).length === 0) throw new Error("Nothing to update — no fields given.");
}

/* ------------------------------------------------------------------ */
/* Safe-list RPC access                                                */
/* ------------------------------------------------------------------ */

/* eslint-disable @typescript-eslint/no-explicit-any -- the safe-list RPCs are
   security-definer set-returning functions; supabase-js types their filter
   chain loosely. */
export function safeRpc(supabase: Client) {
  return supabase.rpc.bind(supabase) as any;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Untyped table access for tables newer than the generated types. */
/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
export function anyDb(supabase: Client): any {
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  return supabase as any;
}

/* ------------------------------------------------------------------ */
/* Campaign access                                                     */
/* ------------------------------------------------------------------ */

export interface CampaignAccess {
  id: string;
  name: string;
  gmId: string;
  isGm: boolean;
}

export async function loadCampaign(
  ctx: McpToolContext,
  campaignId: string,
): Promise<CampaignAccess> {
  const { data, error } = await ctx.supabase
    .from("campaigns")
    .select("id, name, gm_id")
    .eq("id", campaignId)
    .maybeSingle();
  if (error) fail("Campaign lookup", error);
  if (!data) throw new Error("Campaign not found, or you do not have access to it.");
  return { id: data.id, name: data.name, gmId: data.gm_id, isGm: data.gm_id === ctx.userId };
}

export function requireGm(campaign: CampaignAccess): void {
  if (!campaign.isGm) {
    throw new Error(`Only the Game Master of "${campaign.name}" can change its world entries.`);
  }
}

/** Game-Master-only guard whose message names the action being refused. */
export function requireGmFor(campaign: CampaignAccess, action: string): void {
  if (!campaign.isGm) {
    throw new Error(`Only the Game Master of "${campaign.name}" can ${action}.`);
  }
}

/** True when the caller is a member (player or GM) of the campaign. */
export async function isCampaignMember(ctx: McpToolContext, campaignId: string): Promise<boolean> {
  const { data, error } = await ctx.supabase
    .from("campaign_members")
    .select("user_id")
    .eq("campaign_id", campaignId)
    .eq("user_id", ctx.userId)
    .maybeSingle();
  if (error) fail("Membership lookup", error);
  return Boolean(data);
}

/* ------------------------------------------------------------------ */
/* GM-only field stripping                                             */
/* ------------------------------------------------------------------ */

export function stripGmFields<T extends Record<string, unknown>>(
  row: T,
  isGm: boolean,
  fields: readonly string[],
): Record<string, unknown> {
  if (isGm) return { ...row };
  const out: Record<string, unknown> = { ...row };
  for (const field of fields) delete out[field];
  return out;
}

/* ------------------------------------------------------------------ */
/* Character access                                                    */
/* ------------------------------------------------------------------ */

export interface CharacterAccess {
  row: Database["public"]["Tables"]["characters"]["Row"];
  isOwner: boolean;
  isGm: boolean;
}

export async function loadCharacter(
  ctx: McpToolContext,
  characterId: string,
): Promise<CharacterAccess> {
  const { data, error } = await ctx.supabase
    .from("characters")
    .select("*")
    .eq("id", characterId)
    .maybeSingle();
  if (error) fail("Character lookup", error);
  if (!data) throw new Error("Character not found, or you do not have access to it.");

  const isOwner = data.owner_id === ctx.userId;
  let isGm = false;
  if (data.campaign_id) {
    const { data: campaign } = await ctx.supabase
      .from("campaigns")
      .select("gm_id")
      .eq("id", data.campaign_id)
      .maybeSingle();
    isGm = campaign?.gm_id === ctx.userId;
  }
  return { row: data, isOwner, isGm };
}

export function characterView(access: CharacterAccess): Structured {
  const { gm_notes, ...rest } = access.row;
  const out: Structured = { ...rest };
  if (access.isOwner || access.isGm) out["gm_notes"] = gm_notes;
  return out;
}

export function requireCharacterWrite(access: CharacterAccess): void {
  if (!access.isOwner && !access.isGm) {
    throw new Error(
      `Only the owner of "${access.row.name}" or their campaign's Game Master can change this sheet.`,
    );
  }
}

export function requireCharacterOwner(access: CharacterAccess): void {
  if (!access.isOwner) {
    throw new Error(`Only the owner of "${access.row.name}" can delete this sheet.`);
  }
}

/* ------------------------------------------------------------------ */
/* Registration helper                                                 */
/* ------------------------------------------------------------------ */

export type ToolResult = {
  content: { type: "text"; text: string }[];
  structuredContent: Structured;
};

export interface ToolAnnotations {
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
}

export interface ToolDefinition<I extends z.ZodType, O extends z.ZodType> {
  title: string;
  description: string;
  inputSchema: I;
  outputSchema: O;
  annotations: ToolAnnotations;
}

export const READ: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
};
export const CREATE: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
};
export const MODIFY: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
};
export const DESTROY: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
};

/**
 * Module-level cache of the immutable JSON Schema conversion for a given zod
 * schema object. Schemas are built once, at server-construction time, from
 * fixed tool definitions — never from request or user state — so caching by
 * object identity is safe and holds only immutable schema JSON, nothing
 * request-scoped. This only avoids re-running `z.toJSONSchema` for the same
 * schema object across repeated MCP requests; server construction itself
 * stays stateless per request, with handlers bound to that request's
 * RLS-scoped ctx.
 */
const jsonSchemaCache = new WeakMap<z.ZodType, unknown>();

/**
 * The MCP SDK accepts any Standard Schema that can also describe itself as JSON
 * Schema; zod covers the first half, so we attach the second.
 */
export function withJson<T extends z.ZodType>(schema: T): T {
  let jsonSchema = jsonSchemaCache.get(schema);
  if (jsonSchema === undefined) {
    jsonSchema = z.toJSONSchema(schema, { io: "input", unrepresentable: "any" });
    jsonSchemaCache.set(schema, jsonSchema);
  }
  return Object.assign(schema, { jsonSchema });
}

export type ToolRegistrar = <I extends z.ZodType, O extends z.ZodType>(
  name: string,
  definition: ToolDefinition<I, O>,
  handler: (input: z.infer<I>) => Promise<ToolResult>,
) => void;

export function registrar(server: McpServer): ToolRegistrar {
  return function tool<I extends z.ZodType, O extends z.ZodType>(
    name: string,
    definition: ToolDefinition<I, O>,
    handler: (input: z.infer<I>) => Promise<ToolResult>,
  ): void {
    const prepared = {
      ...definition,
      inputSchema: withJson(definition.inputSchema),
      outputSchema: withJson(definition.outputSchema),
    };
    (server.registerTool as unknown as (toolName: string, config: unknown, cb: unknown) => void)(
      name,
      prepared,
      handler,
    );
  };
}

/* ------------------------------------------------------------------ */
/* Discriminated-union domain tools                                    */
/* ------------------------------------------------------------------ */

/**
 * Output schema shared by every domain tool: each action returns one of the
 * standard shapes, so a single permissive object keeps the contract honest
 * without pretending the shape is identical for every action.
 */
export const domainOutput = z.object({
  action: z.string().optional(),
  count: z.number().int().optional(),
  total: z.number().int().optional(),
  truncated: z.boolean().optional(),
  items: z.array(z.record(z.string(), z.unknown())).optional(),
  item: z.record(z.string(), z.unknown()).optional(),
  deleted: z.boolean().optional(),
  id: z.string().optional(),
  url: z.string().optional(),
  expires_at: z.string().optional(),
  result: z.record(z.string(), z.unknown()).optional(),
});

/** Adds the action name to structured content so callers can branch on it. */
export function tagAction(action: string, result: ToolResult): ToolResult {
  return { ...result, structuredContent: { action, ...result.structuredContent } };
}

/**
 * Builds the handler for a domain tool from a map of per-action handlers. The
 * caller supplies a zod discriminated union so each action keeps a strict
 * schema while the assistant still sees one discoverable tool per domain.
 */
export function actionRouter<T extends { action: string }>(handlers: {
  [K in T["action"]]: (input: Extract<T, { action: K }>) => Promise<ToolResult>;
}): (input: T) => Promise<ToolResult> {
  return async (input: T) => {
    const handler = (handlers as unknown as Record<string, (value: T) => Promise<ToolResult>>)[
      input.action
    ];
    if (!handler) throw new Error(`Unknown action "${input.action}".`);
    return tagAction(input.action, await handler(input));
  };
}

/* ------------------------------------------------------------------ */
/* Counting                                                            */
/* ------------------------------------------------------------------ */

/** Exact row count for a table with the same filters as the listed rows. */
export async function countRows(
  build: () => PromiseLike<{ count: number | null; error: { message: string } | null }>,
  fallback: number,
): Promise<number> {
  const { count, error } = await build();
  if (error) fail("Counting rows", error);
  return typeof count === "number" ? count : fallback;
}
