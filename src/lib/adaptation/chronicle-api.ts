import { supabase } from "@/integrations/supabase/client";
import { hashValue } from "@/lib/adaptation/hash";
import type { ChronicleItemType, ProvenanceType } from "@/lib/adaptation/types";

/**
 * Session chronicle data access.
 *
 * The existing prep/recap notes are untouched: a chronicle can point at them,
 * so the Sessions panel keeps working exactly as before while the chronicle
 * adds transcript, reconstruction and reviewable findings on top.
 */

// The adaptation tables were created after the generated types were written.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export interface SessionChronicle {
  id: string;
  campaign_id: string;
  created_by: string;
  title: string;
  session_no: number | null;
  played_on: string | null;
  in_world_date: Record<string, unknown> | null;
  status: "draft" | "analyzed" | "approved";
  prep_note_id: string | null;
  recap_note_id: string | null;
  transcript: string;
  raw_notes: string;
  approved_recap: string;
  materials: { title: string; bucket: string; path: string; media_type?: string }[];
  content_hash: string;
  created_at: string;
  updated_at: string;
}

export interface SessionChronicleItem {
  id: string;
  chronicle_id: string;
  campaign_id: string;
  item_type: ChronicleItemType;
  sequence_no: number;
  summary: string;
  detail: string;
  subject_entity_id: string | null;
  character_id: string | null;
  provenance_type: ProvenanceType;
  source_refs: unknown[];
  review_status: "confirmed" | "needs_review" | "rejected";
  gm_only: boolean;
  data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

function unwrap<T>(res: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (res.error) throw new Error(res.error.message);
  return res.data as NonNullable<T>;
}

export async function listSessionChronicles(campaignId: string): Promise<SessionChronicle[]> {
  return unwrap(
    await db
      .from("session_chronicles")
      .select("*")
      .eq("campaign_id", campaignId)
      .order("session_no", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true }),
  ) as SessionChronicle[];
}

export async function createSessionChronicle(input: {
  campaign_id: string;
  title: string;
  session_no?: number | null;
  played_on?: string | null;
  prep_note_id?: string | null;
  recap_note_id?: string | null;
}): Promise<SessionChronicle> {
  const { data: auth } = await supabase.auth.getUser();
  const created_by = auth.user?.id;
  if (!created_by) throw new Error("You must be signed in.");
  return unwrap(
    await db
      .from("session_chronicles")
      .insert({ ...input, created_by })
      .select("*")
      .single(),
  ) as SessionChronicle;
}

export async function updateSessionChronicle(
  id: string,
  patch: Partial<Omit<SessionChronicle, "id" | "campaign_id" | "created_by">>,
): Promise<SessionChronicle> {
  const next = { ...patch } as Record<string, unknown>;
  if (patch.transcript !== undefined || patch.raw_notes !== undefined) {
    next["content_hash"] = hashValue([patch.transcript ?? "", patch.raw_notes ?? ""]);
  }
  return unwrap(
    await db.from("session_chronicles").update(next).eq("id", id).select("*").single(),
  ) as SessionChronicle;
}

export async function deleteSessionChronicle(id: string): Promise<void> {
  const { error } = await db.from("session_chronicles").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function listSessionChronicleItems(
  chronicleId: string,
): Promise<SessionChronicleItem[]> {
  return unwrap(
    await db
      .from("session_chronicle_items")
      .select("*")
      .eq("chronicle_id", chronicleId)
      .order("item_type", { ascending: true })
      .order("sequence_no", { ascending: true }),
  ) as SessionChronicleItem[];
}

export async function addSessionChronicleItems(
  items: Omit<SessionChronicleItem, "id" | "created_at" | "updated_at">[],
): Promise<SessionChronicleItem[]> {
  if (!items.length) return [];
  return unwrap(
    await db.from("session_chronicle_items").insert(items).select("*"),
  ) as SessionChronicleItem[];
}

export async function updateSessionChronicleItem(
  id: string,
  patch: Partial<SessionChronicleItem>,
): Promise<SessionChronicleItem> {
  return unwrap(
    await db.from("session_chronicle_items").update(patch).eq("id", id).select("*").single(),
  ) as SessionChronicleItem;
}

export async function deleteSessionChronicleItem(id: string): Promise<void> {
  const { error } = await db.from("session_chronicle_items").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
