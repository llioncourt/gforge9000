import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Images, X } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useT } from "@/i18n/hooks";
import {
  listAdaptationAssets,
  replaceAdaptationAssets,
  updateAdaptationAsset,
} from "@/lib/adaptation/api";
import { collectAssetCandidates } from "@/lib/adaptation/asset-candidates";
import { resolveAssets, resolverStats } from "@/lib/adaptation/assets";
import { listEntities } from "@/lib/lore";
import type { StepProps } from "@/components/adaptation/adaptation-wizard";

export function AssetsStep({ project }: StepProps) {
  const { t } = useT("adaptation");
  const queryClient = useQueryClient();

  const assets = useQuery({
    queryKey: ["adaptation-assets", project.id],
    queryFn: () => listAdaptationAssets(project.id),
  });
  const entities = useQuery({
    queryKey: ["lore-entities", project.campaign_id],
    queryFn: () => listEntities(project.campaign_id),
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["adaptation-assets", project.id] });

  const resolve = useMutation({
    mutationFn: async () => {
      const { candidates, entities: targets } = await collectAssetCandidates(project.campaign_id);
      const resolved = resolveAssets(candidates, targets);
      await replaceAdaptationAssets(
        project.id,
        resolved.map((asset) => ({
          source_kind: asset.source_kind,
          source_id: asset.source_id,
          canonical_entity_id: asset.canonical_entity_id,
          role: asset.role,
          bucket: asset.bucket,
          storage_path: asset.storage_path,
          media_type: asset.media_type,
          byte_size: asset.byte_size,
          is_canonical: asset.is_canonical,
          resolution_status: asset.resolution_status,
          suggested_by: asset.suggested_by,
        })),
      );
      return resolverStats(resolved, targets);
    },
    onSuccess: () => {
      invalidate();
      toast.success(t("assets.toasts.resolved"));
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Record<string, unknown> }) =>
      updateAdaptationAsset(id, patch),
    onSuccess: () => {
      invalidate();
      toast.success(t("assets.toasts.updated"));
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const rows = assets.data ?? [];
  const counts = {
    resolved: rows.filter((row) => row.resolution_status === "resolved").length,
    unresolved: rows.filter((row) => row.resolution_status === "unresolved").length,
    ambiguous: rows.filter((row) => row.resolution_status === "ambiguous").length,
  };
  const missingVisuals = (entities.data ?? []).filter(
    (entity) => !rows.some((row) => row.canonical_entity_id === entity.id),
  );

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h4 className="font-display text-base font-semibold">{t("assets.title")}</h4>
        <p className="text-sm text-muted-foreground">{t("assets.description")}</p>
      </header>

      <Button disabled={resolve.isPending} onClick={() => resolve.mutate()}>
        <Images className="mr-1 h-4 w-4" />
        {resolve.isPending ? t("assets.resolving") : t("assets.resolveButton")}
      </Button>

      <div className="flex flex-wrap gap-2 text-xs">
        <Badge variant="secondary">
          {t("assets.counts.resolved")}: {counts.resolved}
        </Badge>
        <Badge variant="secondary">
          {t("assets.counts.unresolved")}: {counts.unresolved}
        </Badge>
        <Badge variant="secondary">
          {t("assets.counts.ambiguous")}: {counts.ambiguous}
        </Badge>
        <Badge variant="secondary">
          {t("assets.counts.missingVisuals")}: {missingVisuals.length}
        </Badge>
      </div>

      {assets.isLoading ? (
        <Skeleton className="h-64 w-full rounded-lg" />
      ) : rows.length ? (
        <ScrollArea className="h-[26rem] rounded-lg border p-3">
          <ul className="space-y-3">
            {rows.map((row) => (
              <li key={row.id} className="space-y-2 rounded-lg border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">
                    {row.storage_path?.split("/").pop() ?? row.source_kind}
                  </span>
                  <Badge variant="outline" className="text-[10px]">
                    {row.resolution_status}
                  </Badge>
                  {row.is_canonical ? (
                    <Badge variant="secondary" className="text-[10px]">
                      {t("assets.markCanonical")}
                    </Badge>
                  ) : null}
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="space-y-1 text-xs text-muted-foreground">
                    {t("assets.entityLabel")}
                    <Select
                      value={row.canonical_entity_id ?? "none"}
                      onValueChange={(value) =>
                        update.mutate({
                          id: row.id,
                          patch: {
                            canonical_entity_id: value === "none" ? null : value,
                            resolution_status: value === "none" ? "unresolved" : "resolved",
                            suggested_by: "manual",
                          },
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{t("assets.unlinked")}</SelectItem>
                        {(entities.data ?? []).map((entity) => (
                          <SelectItem key={entity.id} value={entity.id}>
                            {entity.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>

                  <label className="space-y-1 text-xs text-muted-foreground">
                    {t("assets.roleLabel")}
                    <Select
                      value={row.role}
                      onValueChange={(value) =>
                        update.mutate({ id: row.id, patch: { role: value } })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {["character", "location", "prop", "wardrobe", "map", "reference"].map(
                          (role) => (
                            <SelectItem key={role} value={role}>
                              {role}
                            </SelectItem>
                          ),
                        )}
                      </SelectContent>
                    </Select>
                  </label>
                </div>

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      update.mutate({
                        id: row.id,
                        patch: { resolution_status: "resolved", is_canonical: true },
                      })
                    }
                  >
                    <Check className="mr-1 h-3.5 w-3.5" /> {t("assets.confirm")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      update.mutate({ id: row.id, patch: { resolution_status: "rejected" } })
                    }
                  >
                    <X className="mr-1 h-3.5 w-3.5" /> {t("assets.reject")}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </ScrollArea>
      ) : (
        <p className="text-sm text-muted-foreground">{t("assets.noneYet")}</p>
      )}

      {missingVisuals.length ? (
        <section className="space-y-2">
          <h5 className="text-sm font-semibold">{t("assets.missingVisualsTitle")}</h5>
          <div className="flex flex-wrap gap-2">
            {missingVisuals.map((entity) => (
              <Badge key={entity.id} variant="outline" className="text-[10px]">
                {entity.name}
              </Badge>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
