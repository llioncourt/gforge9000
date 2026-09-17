import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";

export type NotificationRow = Tables<"notifications">;

function unwrap<T>(res: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (res.error) throw new Error(res.error.message);
  return res.data as NonNullable<T>;
}

export async function listNotifications(limit = 40): Promise<NotificationRow[]> {
  return unwrap(
    await supabase
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit),
  );
}

export async function createNotification(input: TablesInsert<"notifications">): Promise<void> {
  const { error } = await supabase.from("notifications").insert(input);
  if (error) throw new Error(error.message);
}

export async function markNotificationRead(id: string, read: boolean): Promise<void> {
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: read ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function markAllNotificationsRead(): Promise<void> {
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null);
  if (error) throw new Error(error.message);
}

export async function deleteNotification(id: string): Promise<void> {
  const { error } = await supabase.from("notifications").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
