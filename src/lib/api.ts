import { DEFAULT_PACK_NAME } from "@/lib/packs";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import type { CharacterEntry, CharacterRecord } from "@/rules";

export type CharacterRow = Tables<"characters">;
export type EntryRow = Tables<"character_entries">;
export type CampaignRow = Tables<"campaigns">;
export type LibraryRow = Tables<"library_entries">;
export type NoteRow = Tables<"campaign_notes">;
export type VersionRow = Tables<"character_versions">;
export type RollRow = Tables<"roll_history">;

function unwrap<T>(res: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (res.error) throw new Error(res.error.message);
  return res.data as NonNullable<T>;
}

export function toCharacterRecord(row: CharacterRow): CharacterRecord {
  return {
    id: row.id,
    name: row.name,
    player_name: row.player_name,
    concept: row.concept,
    point_budget: row.point_budget,
    tech_level: row.tech_level,
    st: row.st,
    dx: row.dx,
    iq: row.iq,
    ht: row.ht,
    hp_delta: row.hp_delta,
    will_delta: row.will_delta,
    per_delta: row.per_delta,
    fp_delta: row.fp_delta,
    speed_delta: Number(row.speed_delta),
    move_delta: row.move_delta,
    current_hp: row.current_hp,
    current_fp: row.current_fp,
    conditions: row.conditions ?? [],
    wealth: row.wealth,
    status: row.status,
    notes: row.notes,
    is_npc: row.is_npc,
    approved: row.approved,
  };
}

export function toEntry(row: EntryRow): CharacterEntry {
  return {
    id: row.id,
    character_id: row.character_id,
    kind: row.kind as CharacterEntry["kind"],
    name: row.name,
    category: row.category,
    points: row.points,
    levels: row.levels,
    data: (row.data ?? {}) as CharacterEntry["data"],
    notes: row.notes,
    source: (row.source ?? {}) as CharacterEntry["source"],
    sort_order: row.sort_order,
  };
}

/* ---------- characters ---------- */

export async function listCharacters() {
  return unwrap(
    await supabase.from("characters").select("*").order("updated_at", { ascending: false }),
  );
}

export async function getCharacter(id: string) {
  return unwrap(await supabase.from("characters").select("*").eq("id", id).single());
}

export async function listEntries(characterId: string) {
  return unwrap(
    await supabase
      .from("character_entries")
      .select("*")
      .eq("character_id", characterId)
      .order("kind")
      .order("sort_order")
      .order("name"),
  );
}

export async function createCharacter(input: Partial<TablesInsert<"characters">> = {}) {
  const { data: auth } = await supabase.auth.getUser();
  return unwrap(
    await supabase
      .from("characters")
      .insert({ ...input, owner_id: auth.user!.id } as TablesInsert<"characters">)
      .select()
      .single(),
  );
}

export async function updateCharacter(id: string, patch: TablesUpdate<"characters">) {
  return unwrap(await supabase.from("characters").update(patch).eq("id", id).select().single());
}

export async function deleteCharacter(id: string) {
  const { data, error } = await supabase.from("characters").delete().eq("id", id).select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) {
    throw new Error("Character could not be deleted — you may not have permission.");
  }
}

export async function addEntry(input: TablesInsert<"character_entries">) {
  return unwrap(await supabase.from("character_entries").insert(input).select().single());
}

export async function updateEntry(id: string, patch: TablesUpdate<"character_entries">) {
  return unwrap(
    await supabase.from("character_entries").update(patch).eq("id", id).select().single(),
  );
}

export async function deleteEntry(id: string) {
  const { error } = await supabase.from("character_entries").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/* ---------- versions ---------- */

export async function listVersions(characterId: string) {
  return unwrap(
    await supabase
      .from("character_versions")
      .select("*")
      .eq("character_id", characterId)
      .order("created_at", { ascending: false })
      .limit(40),
  );
}

export async function saveVersion(characterId: string, label: string) {
  const character = await getCharacter(characterId);
  const entries = await listEntries(characterId);
  return unwrap(
    await supabase
      .from("character_versions")
      .insert({ character_id: characterId, label, snapshot: { character, entries } })
      .select()
      .single(),
  );
}

export async function restoreVersion(version: VersionRow) {
  const snapshot = version.snapshot as unknown as { character: CharacterRow; entries: EntryRow[] };
  const { id, created_at, updated_at, owner_id, ...rest } = snapshot.character;
  await supabase.from("characters").update(rest).eq("id", version.character_id);
  await supabase.from("character_entries").delete().eq("character_id", version.character_id);
  if (snapshot.entries.length) {
    const rows = snapshot.entries.map((e) => {
      const { id: _entryId, created_at: _c, updated_at: _u, ...entry } = e;
      return { ...entry, character_id: version.character_id };
    });
    const { error } = await supabase.from("character_entries").insert(rows);
    if (error) throw new Error(error.message);
  }
}

/* ---------- campaigns ---------- */

export async function listCampaigns() {
  return unwrap(
    await supabase.from("campaigns").select("*").order("created_at", { ascending: false }),
  );
}

export async function getCampaign(id: string) {
  return unwrap(await supabase.from("campaigns").select("*").eq("id", id).single());
}

export async function createCampaign(input: Partial<TablesInsert<"campaigns">> & { name: string }) {
  const { data: auth } = await supabase.auth.getUser();
  return unwrap(
    await supabase
      .from("campaigns")
      .insert({ ...input, gm_id: auth.user!.id })
      .select()
      .single(),
  );
}

export async function updateCampaign(id: string, patch: TablesUpdate<"campaigns">) {
  return unwrap(await supabase.from("campaigns").update(patch).eq("id", id).select().single());
}

export async function joinCampaign(code: string) {
  const { data, error } = await supabase.rpc("join_campaign", { _code: code });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function transferCampaignGm(campaignId: string, newGmId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC created after types were generated
  const { error } = await (supabase.rpc as any)("transfer_campaign_gm", {
    _campaign: campaignId,
    _new_gm: newGmId,
  });
  if (error) throw new Error(error.message);
}

export async function listMembers(campaignId: string) {
  const members = unwrap(
    await supabase.from("campaign_members").select("*").eq("campaign_id", campaignId),
  );
  const ids = members.map((m) => m.user_id);
  const profiles = ids.length
    ? unwrap(await supabase.from("profiles").select("id, display_name").in("id", ids))
    : [];
  return members.map((m) => ({
    ...m,
    display_name: profiles.find((p) => p.id === m.user_id)?.display_name ?? "Player",
  }));
}

export async function removeMember(campaignId: string, userId: string) {
  const { error } = await supabase
    .from("campaign_members")
    .delete()
    .eq("campaign_id", campaignId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function listCampaignCharacters(campaignId: string) {
  return unwrap(
    await supabase.from("characters").select("*").eq("campaign_id", campaignId).order("name"),
  );
}

export async function listEntriesForCharacters(ids: string[]) {
  if (ids.length === 0) return [] as EntryRow[];
  return unwrap(await supabase.from("character_entries").select("*").in("character_id", ids));
}

export async function setCharacterCampaign(characterId: string, campaignId: string | null) {
  if (campaignId === null) {
    // Unlinking goes through a security-definer RPC: the GM must be allowed to
    // detach a character even though the row leaves their RLS visibility.
    const { error } = await supabase.rpc("remove_character_from_campaign", {
      _character: characterId,
    });
    if (error) throw new Error(error.message);
    return;
  }
  const { error } = await supabase
    .from("characters")
    .update({ campaign_id: campaignId })
    .eq("id", characterId);
  if (error) throw new Error(error.message);
}

export async function listNotes(campaignId: string) {
  return unwrap(
    await supabase
      .from("campaign_notes")
      .select("*")
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: false }),
  );
}

export async function addNote(input: TablesInsert<"campaign_notes">) {
  const { data: auth } = await supabase.auth.getUser();
  return unwrap(
    await supabase
      .from("campaign_notes")
      .insert({ ...input, author_id: auth.user!.id })
      .select()
      .single(),
  );
}

export async function updateNote(id: string, patch: TablesUpdate<"campaign_notes">) {
  return unwrap(await supabase.from("campaign_notes").update(patch).eq("id", id).select().single());
}

export async function deleteNote(id: string) {
  const { error } = await supabase.from("campaign_notes").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/* ---------- library ---------- */

export async function listLibrary() {
  return unwrap(
    await supabase.from("library_entries").select("*").order("name", { ascending: true }),
  );
}

export async function createLibraryEntry(input: TablesInsert<"library_entries">) {
  const { data: auth } = await supabase.auth.getUser();
  const pack = (input.pack ?? "").trim() || DEFAULT_PACK_NAME;
  await ensureContentPack(pack);
  return unwrap(
    await supabase
      .from("library_entries")
      .insert({ ...input, pack, owner_id: auth.user!.id })
      .select()
      .single(),
  );
}

export async function deleteLibraryEntry(id: string) {
  const { error } = await supabase.from("library_entries").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/* ---------- rolls ---------- */

export async function listRolls(limit = 30) {
  return unwrap(
    await supabase
      .from("roll_history")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit),
  );
}

export async function recordRoll(input: Omit<TablesInsert<"roll_history">, "user_id">) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  return unwrap(
    await supabase
      .from("roll_history")
      .insert({ ...input, user_id: auth.user.id })
      .select()
      .single(),
  );
}

/* ---------- profile ---------- */

export async function getProfile(userId: string) {
  return unwrap(await supabase.from("profiles").select("*").eq("id", userId).maybeSingle());
}

export async function upsertProfile(userId: string, patch: TablesUpdate<"profiles">) {
  return unwrap(
    await supabase
      .from("profiles")
      .upsert({ id: userId, ...patch } as TablesInsert<"profiles">)
      .select()
      .single(),
  );
}

/* ---------- duplication ---------- */

/**
 * Copies a character and all of its entries for the current user. Transient
 * combat state (current HP/FP, conditions, ammo) is intentionally not copied.
 */
export async function duplicateCharacter(id: string, nameSuffix = "copy") {
  const source = await getCharacter(id);
  const entries = await listEntries(id);
  const {
    id: _id,
    created_at: _c,
    updated_at: _u,
    owner_id: _o,
    current_hp: _hp,
    current_fp: _fp,
    conditions: _cond,
    ...rest
  } = source;
  const copy = await createCharacter({
    ...rest,
    name: `${source.name} (${nameSuffix})`,
    approved: false,
  } as TablesInsert<"characters">);
  if (entries.length) {
    const rows = entries.map((e) => {
      const { id: _eid, created_at: _ec, updated_at: _eu, ...entry } = e;
      return { ...entry, character_id: copy.id };
    });
    const { error } = await supabase.from("character_entries").insert(rows);
    if (error) throw new Error(error.message);
  }
  return copy;
}

/* ---------- library extras ---------- */

export async function updateLibraryEntry(id: string, patch: TablesUpdate<"library_entries">) {
  return unwrap(
    await supabase.from("library_entries").update(patch).eq("id", id).select().single(),
  );
}

export async function importLibraryEntries(rows: Omit<TablesInsert<"library_entries">, "owner_id">[]) {
  const { data: auth } = await supabase.auth.getUser();
  if (!rows.length) return [] as LibraryRow[];
  const withPacks = rows.map((r) => ({
    ...r,
    pack: (r.pack ?? "").trim() || DEFAULT_PACK_NAME,
  }));
  for (const name of new Set(withPacks.map((r) => r.pack))) await ensureContentPack(name);
  return unwrap(
    await supabase
      .from("library_entries")
      .insert(withPacks.map((r) => ({ ...r, owner_id: auth.user!.id })) as TablesInsert<"library_entries">[])
      .select(),
  );
}

/* ---------- content packs ---------- */

/** Creates the pack row if this user does not have it yet. */
async function ensureContentPack(name: string) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return;
  const { data: existing } = await supabase
    .from("content_packs")
    .select("id")
    .eq("owner_id", auth.user.id)
    .eq("name", name)
    .maybeSingle();
  if (existing) return;
  await supabase
    .from("content_packs")
    .insert({ name, owner_id: auth.user.id } as TablesInsert<"content_packs">);
}

export type PackRow = Tables<"content_packs">;

export async function listContentPacks() {
  return unwrap(await supabase.from("content_packs").select("*").order("name"));
}

export async function createContentPack(input: Partial<TablesInsert<"content_packs">> & { name: string }) {
  const { data: auth } = await supabase.auth.getUser();
  return unwrap(
    await supabase
      .from("content_packs")
      .insert({ ...input, owner_id: auth.user!.id } as TablesInsert<"content_packs">)
      .select()
      .single(),
  );
}

export async function updateContentPack(id: string, patch: TablesUpdate<"content_packs">) {
  return unwrap(await supabase.from("content_packs").update(patch).eq("id", id).select().single());
}

/** Renames a pack and re-tags every library entry that referenced the old name. */
export async function renameContentPack(id: string, oldName: string, newName: string) {
  const pack = await updateContentPack(id, { name: newName });
  const { data: auth } = await supabase.auth.getUser();
  if (auth.user) {
    const { error } = await supabase
      .from("library_entries")
      .update({ pack: newName })
      .eq("owner_id", auth.user.id)
      .eq("pack", oldName);
    if (error) throw new Error(error.message);
  }
  return pack;
}

/**
 * Deletes every library entry inside a pack. Copies already on a character
 * sheet are kept but lose their pack provenance and become custom entries.
 */
export async function deletePackContents(name: string) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return;
  const { data: mine } = await supabase
    .from("characters")
    .select("id, packs")
    .eq("owner_id", auth.user.id);
  const ids = (mine ?? []).map((c) => c.id);
  if (ids.length) {
    const { data: entries } = await supabase
      .from("character_entries")
      .select("id, source")
      .in("character_id", ids);
    const affected = (entries ?? []).filter((e) => {
      const s = (e.source ?? {}) as Record<string, unknown>;
      return typeof s["pack"] === "string" && s["pack"].toLowerCase() === name.toLowerCase();
    });
    for (const e of affected) {
      const { error } = await supabase
        .from("character_entries")
        .update({ source: { type: "custom" } })
        .eq("id", e.id);
      if (error) throw new Error(error.message);
    }
    for (const c of mine ?? []) {
      const packs = (c.packs ?? []) as string[];
      if (packs.some((p) => p.toLowerCase() === name.toLowerCase())) {
        const { error } = await supabase
          .from("characters")
          .update({ packs: packs.filter((p) => p.toLowerCase() !== name.toLowerCase()) })
          .eq("id", c.id);
        if (error) throw new Error(error.message);
      }
    }
  }
  const { error } = await supabase
    .from("library_entries")
    .delete()
    .eq("owner_id", auth.user.id)
    .eq("pack", name);
  if (error) throw new Error(error.message);
}

/** Deletes the pack and everything inside it. */
export async function deleteContentPack(id: string, name: string) {
  await deletePackContents(name);
  const { error } = await supabase.from("content_packs").delete().eq("id", id);
  if (error) throw new Error(error.message);
}



/** Moves a single library entry into (or out of) a pack. */
export async function setLibraryEntryPack(entryId: string, pack: string | null) {
  return updateLibraryEntry(entryId, { pack });
}

/* ---------- danger zone ---------- */

/**
 * Deletes every record this account owns: characters and their entries,
 * versions and weapon state, campaigns, notes, memberships, library entries,
 * packs and roll history. The account itself is kept.
 */
export async function wipeAllMyData() {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error("You must be signed in.");

  const { data: mine } = await supabase.from("characters").select("id").eq("owner_id", uid);
  const ids = (mine ?? []).map((c) => c.id);

  const fail = (error: { message: string } | null) => {
    if (error) throw new Error(error.message);
  };

  if (ids.length) {
    fail((await supabase.from("character_weapon_state").delete().in("character_id", ids)).error);
    fail((await supabase.from("character_versions").delete().in("character_id", ids)).error);
    fail((await supabase.from("character_entries").delete().in("character_id", ids)).error);
  }
  fail((await supabase.from("characters").delete().eq("owner_id", uid)).error);

  const { data: myCampaigns } = await supabase.from("campaigns").select("id").eq("gm_id", uid);
  const campaignIds = (myCampaigns ?? []).map((c) => c.id);
  if (campaignIds.length) {
    fail((await supabase.from("campaign_notes").delete().in("campaign_id", campaignIds)).error);
    fail((await supabase.from("campaign_members").delete().in("campaign_id", campaignIds)).error);
  }
  fail((await supabase.from("campaign_notes").delete().eq("author_id", uid)).error);
  fail((await supabase.from("campaign_members").delete().eq("user_id", uid)).error);
  fail((await supabase.from("campaigns").delete().eq("gm_id", uid)).error);

  fail((await supabase.from("roll_history").delete().eq("user_id", uid)).error);
  fail((await supabase.from("library_entries").delete().eq("owner_id", uid)).error);
  fail((await supabase.from("content_packs").delete().eq("owner_id", uid)).error);
}

