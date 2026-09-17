import { grantKnowledge, revokeKnowledge, updateEntity, type EntityRow } from "@/lib/lore";
import { createNotification } from "@/lib/notifications";
import { sendRevealPush } from "@/lib/push.functions";
import { kindDef } from "@/lib/entity-kinds";
import { isPlayerVisible, visibilityForReveal } from "@/lib/visibility";

export type RevealResult = {
  /** Visibility the record was promoted to, when a promotion was needed. */
  promotedTo: string | null;
  /** True when the record was already readable by every player. */
  alreadyPublic: boolean;
};

/**
 * Reveals a record to one player: grants knowledge, promotes the record to
 * "Selected players" when it is still GM-only (otherwise the grant has no
 * effect under the access rules), and notifies the player.
 */
export async function revealEntityToPlayer(input: {
  entity: EntityRow;
  userId: string;
  gmId: string;
}): Promise<RevealResult> {
  const { entity, userId, gmId } = input;

  if (userId === gmId) {
    throw new Error("The GM cannot be a reveal recipient");
  }

  const promoteTo = visibilityForReveal(entity.visibility);
  if (promoteTo) {
    await updateEntity(entity.id, { visibility: promoteTo });
  }

  await grantKnowledge({
    campaign_id: entity.campaign_id,
    entity_id: entity.id,
    user_id: userId,
    granted_by: gmId,
  });

  // Best-effort: the reveal itself already succeeded, so a failed alert must
  // not roll the GM back into an error with the grant already stored.
  try {
    await createNotification({
      user_id: userId,
      campaign_id: entity.campaign_id,
      entity_id: entity.id,
      kind: "reveal",
      title: `New record revealed: ${entity.name}`,
      body: kindDef(entity.kind).label,
      created_by: gmId,
    });
  } catch {
    /* the record is revealed; the bell alert is best-effort */
  }

  // Background alert: reaches the player even with the app closed.
  try {
    await sendRevealPush({
      data: {
        campaignId: entity.campaign_id,
        userId,
        title: `New record revealed: ${entity.name}`,
        body: kindDef(entity.kind).label,
        url: `/entities/${entity.id}`,
        tag: `reveal-${entity.id}`,
      },
    });
  } catch {
    /* in-app notification already delivered; push is best-effort */
  }

  return { promotedTo: promoteTo, alreadyPublic: isPlayerVisible(entity.visibility) };
}

/**
 * Removes one player's reveal. When it was the last grant on a record that was
 * only shared through grants, the record goes back to GM only.
 */
export async function revokeEntityReveal(input: {
  grantId: string;
  entity: EntityRow | undefined;
  remainingGrants: number;
}): Promise<{ demoted: boolean }> {
  await revokeKnowledge(input.grantId);
  const entity = input.entity;
  if (entity && input.remainingGrants <= 0 && entity.visibility === "SELECTED_PLAYERS") {
    await updateEntity(entity.id, { visibility: "GM_ONLY" });
    return { demoted: true };
  }
  return { demoted: false };
}
