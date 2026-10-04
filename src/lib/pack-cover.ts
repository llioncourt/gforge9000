import { supabase } from "@/integrations/supabase/client";
import { createContentPack, setContentPackCover, type PackRow } from "@/lib/api";
import { currentUser } from "@/lib/current-user";
import { AVIF_MIME, convertToAvif, isImageFile } from "@/lib/image-avif";
import { PORTRAIT_BUCKET, PORTRAIT_MAX_BYTES } from "@/lib/portrait";

/**
 * Pack covers: the image shown behind a content pack's card.
 *
 * Files live in the portraits bucket under the owner's own folder, in a
 * `pack-cover` subfolder; people who can see a pack can read its cover.
 */

export const PACK_COVER_FOLDER = "pack-cover";

/** Largest original accepted; it is resized and re-encoded before upload. */
export const PACK_COVER_SOURCE_MAX_BYTES = 25 * 1024 * 1024;

export const PACK_COVER_ACCEPT = "image/*,.heic,.heif,.tif,.tiff,.bmp";

export type PackCoverProblem = "type" | "empty" | "size" | "signedOut";

export class PackCoverError extends Error {
  readonly problem: PackCoverProblem;
  constructor(problem: PackCoverProblem) {
    super(`pack cover: ${problem}`);
    this.name = "PackCoverError";
    this.problem = problem;
  }
}

/** Pure check of the chosen file, so it can be unit-tested. */
export function packCoverProblem(file: {
  type?: string;
  name?: string;
  size: number;
}): PackCoverProblem | null {
  if (!isImageFile(file)) return "type";
  if (file.size === 0) return "empty";
  if (file.size > PACK_COVER_SOURCE_MAX_BYTES) return "size";
  return null;
}

export function packCoverPathFor(userId: string): string {
  return `${userId}/${PACK_COVER_FOLDER}/${crypto.randomUUID()}.avif`;
}

/**
 * Who may set a pack's cover: the pack's owner. A pack that so far exists only
 * as a name on library entries belongs to whoever owns entries in it.
 */
export function canEditPackCover(input: {
  pack: Pick<PackRow, "owner_id"> | null | undefined;
  userId: string | null | undefined;
  entries: { owner_id?: string | null }[];
}): boolean {
  if (!input.userId) return false;
  if (input.pack) return input.pack.owner_id === input.userId;
  return input.entries.some((entry) => entry.owner_id === input.userId);
}

async function removeFile(path: string): Promise<void> {
  const { error } = await supabase.storage.from(PORTRAIT_BUCKET).remove([path]);
  if (error) throw new Error(error.message);
}

/** Best-effort removal of a cover file, e.g. after its pack was deleted. */
export async function removePackCoverFile(path: string | null | undefined): Promise<void> {
  if (!path) return;
  await removeFile(path).catch(() => undefined);
}

/** The signed-in user's own pack row for this name, created when missing. */
async function ownPackRow(userId: string, packName: string): Promise<PackRow> {
  const { data, error } = await supabase.from("content_packs").select("*").eq("owner_id", userId);
  if (error) throw new Error(error.message);
  const wanted = packName.trim().toLowerCase();
  const existing = ((data ?? []) as PackRow[]).find((p) => p.name.trim().toLowerCase() === wanted);
  if (existing) return existing;
  return (await createContentPack({ name: packName })) as PackRow;
}

/**
 * Uploads `file` as the pack's cover and records it on the pack. The previous
 * cover file, if any, is removed once the new one is in place.
 */
export async function savePackCover(input: {
  pack: PackRow | null | undefined;
  packName: string;
  file: File;
}): Promise<PackRow> {
  const problem = packCoverProblem(input.file);
  if (problem) throw new PackCoverError(problem);

  const { data: auth } = await currentUser();
  if (!auth.user) throw new PackCoverError("signedOut");

  const avif = await convertToAvif(input.file);
  if (avif.size > PORTRAIT_MAX_BYTES) throw new PackCoverError("size");

  const row = input.pack ?? (await ownPackRow(auth.user.id, input.packName));
  const previous = row.cover_path ?? null;

  const path = packCoverPathFor(auth.user.id);
  const { error } = await supabase.storage
    .from(PORTRAIT_BUCKET)
    .upload(path, avif, { cacheControl: "3600", upsert: false, contentType: AVIF_MIME });
  if (error) throw new Error(error.message);

  let updated: PackRow;
  try {
    updated = await setContentPackCover(row.id, path);
  } catch (failure) {
    await removeFile(path).catch(() => undefined);
    throw failure;
  }

  if (previous && previous !== path) await removeFile(previous).catch(() => undefined);
  return updated;
}

/** Takes the cover off the pack and removes its file. */
export async function clearPackCover(pack: PackRow): Promise<PackRow> {
  const previous = pack.cover_path ?? null;
  const updated = await setContentPackCover(pack.id, null);
  if (previous) await removeFile(previous).catch(() => undefined);
  return updated;
}
