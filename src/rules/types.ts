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
  notes?: string;
}

export interface SkillData {
  attribute: ControllingAttribute;
  difficulty: Difficulty;
  points: number;
  specialization?: string;
  bonus?: number;
  defaults?: string;
  prerequisites?: string;
}

export interface TechniqueData extends Partial<SkillData> {
  baseSkill?: string;
  defaultPenalty?: number;
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
  tl?: number;
  legality?: string;
  container?: string;
  dr?: number;
  locations?: string[];
  weapons?: WeaponMode[];
}

export interface TraitData {
  modifiers?: TraitModifier[];
  prerequisites?: string;
  formula?: string;
  tags?: string[];
}

export interface SourceMeta {
  label?: string;
  edition?: string;
  page?: string;
  type?: "user" | "community" | "licensed" | "official";
}

export interface CharacterEntry {
  id: string;
  character_id?: string;
  kind: EntryKind;
  name: string;
  category?: string | null;
  points: number;
  levels: number;
  data: Partial<SkillData & TechniqueData & EquipmentData & TraitData> & Record<string, unknown>;
  notes?: string | null;
  source?: SourceMeta | null;
  sort_order?: number;
}

export interface CharacterRecord {
  id: string;
  name: string;
  player_name?: string | null;
  concept?: string | null;
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
  current_hp?: number | null;
  current_fp?: number | null;
  conditions: string[];
  wealth: string;
  status: number;
  notes?: string | null;
  is_npc?: boolean;
  approved?: boolean;
}
