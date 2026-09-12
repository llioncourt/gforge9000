/**
 * Domain types for the rules engine.
 *
 * The engine is generic: nothing here encodes proprietary rulebook prose.
 * Every numeric assumption lives in `defaultRuleset` (see ./ruleset.ts) so a
 * campaign can override it without touching calculation code.
 */

export type EntryKind =
  | "advantage"
  | "disadvantage"
  | "perk"
  | "quirk"
  | "skill"
  | "technique"
  | "spell"
  | "equipment"
  | "language"
  | "culture"
  | "custom";

export type Difficulty = "E" | "A" | "H" | "VH";
export type ControllingAttribute = "ST" | "DX" | "IQ" | "HT" | "Will" | "Per";

export interface TraitModifier {
  name: string;
  /** Percentage: +100 enhancement, -40 limitation. */
  percent: number;
  notes?: string | undefined;
}

export interface SkillData {
  attribute: ControllingAttribute;
  difficulty: Difficulty;
  points: number;
  specialization?: string | undefined;
  bonus?: number | undefined;
  defaults?: string | undefined;
  prerequisites?: string | undefined;
}

export interface TechniqueData extends Partial<SkillData> {
  baseSkill?: string | undefined;
  defaultPenalty?: number | undefined;
  points: number;
  difficulty: Difficulty;
}

export interface WeaponMode {
  name: string;
  damage: string;
  reach?: string;
  parry?: string;
  accuracy?: string;
  range?: string;
  rof?: string;
  shots?: string;
  bulk?: string;
  recoil?: string;
  skill?: string;
}

export interface EquipmentData {
  quantity: number;
  weight: number;
  cost: number;
  carried: boolean;
  tl?: number | undefined;
  legality?: string | undefined;
  container?: string | undefined;
  dr?: number | undefined;
  locations?: string[] | undefined;
  weapons?: WeaponMode[] | undefined;
}

export interface TraitData {
  modifiers?: TraitModifier[] | undefined;
  prerequisites?: string | undefined;
  formula?: string | undefined;
  tags?: string[] | undefined;
}

export interface SourceMeta {
  label?: string | undefined;
  edition?: string | undefined;
  page?: string | undefined;
  type?: "user" | "community" | "licensed" | "official" | undefined;
}

export interface CharacterEntry {
  id: string;
  character_id?: string | undefined;
  kind: EntryKind;
  name: string;
  category?: string | null | undefined;
  points: number;
  levels: number;
  data: Partial<SkillData & TechniqueData & EquipmentData & TraitData> & Record<string, unknown>;
  notes?: string | null | undefined;
  source?: SourceMeta | null | undefined;
  sort_order?: number | undefined;
}

export interface CharacterRecord {
  id: string;
  name: string;
  player_name?: string | null | undefined;
  concept?: string | null | undefined;
  point_budget: number;
  tech_level: number;
  st: number;
  dx: number;
  iq: number;
  ht: number;
  hp_delta: number;
  will_delta: number;
  per_delta: number;
  fp_delta: number;
  speed_delta: number;
  move_delta: number;
  current_hp?: number | null | undefined;
  current_fp?: number | null | undefined;
  conditions: string[];
  wealth: string;
  status: number;
  notes?: string | null | undefined;
  is_npc?: boolean | undefined;
  approved?: boolean | undefined;
}
