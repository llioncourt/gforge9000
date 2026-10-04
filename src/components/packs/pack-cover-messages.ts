import { PackCoverError } from "@/lib/pack-cover";

type PackCoverErrorKey =
  "cover.errors.type" | "cover.errors.empty" | "cover.errors.size" | "cover.errors.signedOut";

type Translate = (key: PackCoverErrorKey) => string;

/** The message shown when setting a pack cover fails. */
export function packCoverMessage(error: unknown, t: Translate): string {
  if (error instanceof PackCoverError) {
    switch (error.problem) {
      case "type":
        return t("cover.errors.type");
      case "empty":
        return t("cover.errors.empty");
      case "size":
        return t("cover.errors.size");
      case "signedOut":
        return t("cover.errors.signedOut");
    }
  }
  return error instanceof Error ? error.message : String(error);
}
