import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useFormatters, useT } from "@/i18n/hooks";
import {
  listAdaptationSources,
  listChangeSets,
  listScenes,
  listSnapshots,
  saveChangeSet,
  saveScan,
  setChangeSetStatus,
} from "@/lib/adaptation/api";
import { diffSources, impactMap, isEmptyChangeSet, toSourceMap } from "@/lib/adaptation/diff";
import { scanCampaign, type ScanScope } from "@/lib/adaptation/scanner";
import type { SourceRef } from "@/lib/adaptation/types";
import type { StepProps } from "@/components/adaptation/adaptation-wizard";

export function ScanStep({ project, patch }: StepProps) {
  const { t } = useT("adaptation");
  const f = useFormatters();
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState<{ label: string; percent: number } | null>(null);

  const snapshots = useQuery({
    queryKey: ["adaptation-snapshots", project.id],
    queryFn: () => listSnapshots(project.id),
  });
  const changeSets = useQuery({
    queryKey: ["adaptation-change-sets", project.id],
    queryFn: () => listChangeSets(project.id),
  });

  const latest = snapshots.data?.[0] ?? null;
  const openChange = changeSets.data?.find((set) => set.status === "open") ?? null;

  const sources = useQuery({
    queryKey: ["adaptation-sources", project.id],
    queryFn: () => listAdaptationSources(project.id),
  });
  const sourceLabels = new Map(
    (sources.data ?? []).map((source) => [source.source_key, source.label]),
  );

  const scan = useMutation({
    mutationFn: async () => {
      const before = await listAdaptationSources(project.id);
      const previousSnapshot = (await listSnapshots(project.id))[0] ?? null;
      const snapshot = await scanCampaign(
        project.campaign_id,
        (project.source_scope ?? {}) as ScanScope,
        project.source_mode,
        (label, done, total) => setProgress({ label, percent: Math.round((done / total) * 100) }),
      );
      const saved = await saveScan(project.id, snapshot);
      if (before.length) {
        const changes = diffSources(toSourceMap(before), toSourceMap(snapshot.sources));
        if (!isEmptyChangeSet(changes)) {
          const scenes = await listScenes(project.id);
          changes.impact = impactMap(
            [...changes.added, ...changes.changed, ...changes.removed].map(
              (entry) => entry.source_key,
            ),
            scenes.map((scene) => ({
              kind: "scene" as const,
              stable_key: scene.stable_key,
              source_refs: scene.source_refs as SourceRef[],
            })),
          );
          await saveChangeSet(project.id, previousSnapshot?.id ?? null, saved.id, changes);
        }
      }
      await patch({ status: "reviewing" });
    },
    onSuccess: () => {
      setProgress(null);
      queryClient.invalidateQueries({ queryKey: ["adaptation-snapshots", project.id] });
      queryClient.invalidateQueries({ queryKey: ["adaptation-change-sets", project.id] });
      toast.success(t("scan.toasts.scanned"));
    },
    onError: (error: Error) => {
      setProgress(null);
      toast.error(error.message);
    },
  });

  const resolveChange = useMutation({
    mutationFn: (status: "applied" | "dismissed") => setChangeSetStatus(openChange!.id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adaptation-change-sets", project.id] });
      toast.success(t("scan.toasts.applied"));
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h4 className="font-display text-base font-semibold">{t("scan.title")}</h4>
        <p className="text-sm text-muted-foreground">{t("scan.description")}</p>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={scan.isPending} onClick={() => scan.mutate()}>
          <RefreshCw className={`mr-1 h-4 w-4 ${scan.isPending ? "animate-spin" : ""}`} />
          {latest ? t("scan.rescanButton") : t("scan.scanButton")}
        </Button>
        {latest ? (
          <span className="text-xs text-muted-foreground">
            {t("scan.lastScan", { when: f.date(latest.created_at) })}
          </span>
        ) : null}
      </div>

      {scan.isPending ? (
        <div className="space-y-2">
          <Progress value={progress?.percent ?? 0} />
          <p className="text-xs text-muted-foreground">{t("scan.scanning")}</p>
        </div>
      ) : null}

      {snapshots.isLoading ? (
        <Skeleton className="h-24 w-full rounded-lg" />
      ) : latest ? (
        <section className="space-y-2">
          <h5 className="text-sm font-semibold">{t("scan.statsTitle")}</h5>
          <div className="flex flex-wrap gap-2">
            {Object.entries(latest.stats ?? {}).map(([key, value]) => (
              <Badge key={key} variant="outline" className="text-[10px]">
                {key}: {value}
              </Badge>
            ))}
          </div>
        </section>
      ) : (
        <p className="text-sm text-muted-foreground">{t("scan.noSnapshotYet")}</p>
      )}

      <section className="space-y-3">
        <h5 className="text-sm font-semibold">{t("scan.diffTitle")}</h5>
        {openChange ? (
          <div className="space-y-3 rounded-lg border p-3">
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="secondary">
                {t("scan.added")}: {openChange.added.length}
              </Badge>
              <Badge variant="secondary">
                {t("scan.changed")}: {openChange.changed.length}
              </Badge>
              <Badge variant="secondary">
                {t("scan.removed")}: {openChange.removed.length}
              </Badge>
            </div>

            <div className="space-y-1">
              <h6 className="text-xs font-semibold uppercase text-muted-foreground">
                {t("scan.impactTitle")}
              </h6>
              {openChange.impact.length ? (
                <ul className="space-y-1 text-sm">
                  {openChange.impact.map((entry) => (
                    <li key={entry.source_key} className="flex items-center gap-2">
                      <span>{sourceLabels.get(entry.source_key) ?? entry.source_key}</span>
                      <Badge variant="outline" className="text-[10px]">
                        {entry.scene_keys.length}
                      </Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">{t("scan.impactNone")}</p>
              )}
            </div>

            <p className="text-xs text-muted-foreground">{t("scan.conflictsDescription")}</p>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => resolveChange.mutate("applied")}>
                {t("scan.applyChanges")}
              </Button>
              <Button size="sm" variant="outline" onClick={() => resolveChange.mutate("dismissed")}>
                {t("scan.dismiss")}
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("scan.noDiff")}</p>
        )}
      </section>
    </div>
  );
}
