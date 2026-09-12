/**
 * Mutable weapon state (currently: ammunition) persisted separately from the
 * static WeaponMode definition. Pure mapping helpers live here so they can be
 * unit tested without Supabase.
 *
 * Limitation: WeaponMode has no stable identifier, so the state key is derived
 * from the attack-mode index within its equipment entry. Reordering attack
 * modes inside an entry remaps persisted state. A content migration that adds
 * per-mode ids is intentionally out of scope for this phase.
 */
import type { Tables, TablesInsert } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";

export type WeaponStateRow = Tables<"character_weapon_state">;

/** Deterministic, index-derived key for one attack mode of one entry. */
export function attackModeKey(index: number): string {
  return `mode:${index}`;
}

export type WeaponStateMap = Record<string, number>;

function mapKey(entryId: string, modeKey: string): string {
  return `${entryId}/${modeKey}`;
}

/** Rows -> lookup map of `${entryId}/${modeKey}` -> current shots. */
export function toWeaponStateMap(rows: WeaponStateRow[]): WeaponStateMap {
  const map: WeaponStateMap = {};
  for (const row of rows) map[mapKey(row.character_entry_id, row.mode_key)] = row.current_shots;
  return map;
}

/**
 * Persisted current shots for one mode, or undefined when nothing is stored
 * (the caller then initializes from the parsed Shots capacity).
 */
export function currentShotsFor(
  map: WeaponStateMap,
  entryId: string,
  index: number,
): number | undefined {
  return map[mapKey(entryId, attackModeKey(index))];
}

export async function listWeaponState(characterId: string): Promise<WeaponStateRow[]> {
  const { data, error } = await supabase
    .from("character_weapon_state")
    .select("*")
    .eq("character_id", characterId);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function upsertWeaponState(input: {
  characterId: string;
  entryId: string;
  modeKey: string;
  currentShots: number;
}): Promise<WeaponStateRow> {
  const payload: TablesInsert<"character_weapon_state"> = {
    character_id: input.characterId,
    character_entry_id: input.entryId,
    mode_key: input.modeKey,
    current_shots: Math.max(0, Math.trunc(input.currentShots)),
  };
  const { data, error } = await supabase
    .from("character_weapon_state")
    .upsert(payload, { onConflict: "character_id,character_entry_id,mode_key" })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}
