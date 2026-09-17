import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/i18n/hooks";
import { listScenes, updateScene, type AdaptationSceneRow } from "@/lib/adaptation/api";
import type { StepProps } from "@/components/adaptation/adaptation-wizard";

export function TimelineStep({ project }: StepProps) {
  const { t } = useT("adaptation");
  const queryClient = useQueryClient();

  const scenes = useQuery({
    queryKey: ["adaptation-scenes", project.id],
    queryFn: () => listScenes(project.id),
  });

  const swap = useMutation({
    mutationFn: async ({ a, b }: { a: AdaptationSceneRow; b: AdaptationSceneRow }) => {
      await updateScene(a.id, { sequence_no: b.sequence_no });
      await updateScene(b.id, { sequence_no: a.sequence_no });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["adaptation-scenes", project.id] }),
    onError: (error: Error) => toast.error(error.message),
  });

  const list = scenes.data ?? [];
  const conflicts = list.filter((scene) => scene.provenance_type === "conflict");

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h4 className="font-display text-base font-semibold">{t("timeline.title")}</h4>
        <p className="text-sm text-muted-foreground">{t("timeline.description")}</p>
      </header>

      <section className="space-y-2">
        <h5 className="text-sm font-semibold">{t("timeline.conflictsTitle")}</h5>
        {conflicts.length ? (
          <>
            <p className="text-xs text-muted-foreground">{t("timeline.conflictsDescription")}</p>
            <ul className="space-y-1 text-sm">
              {conflicts.map((scene) => (
                <li key={scene.id}>{scene.title}</li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{t("timeline.noConflicts")}</p>
        )}
      </section>

      <section className="space-y-2">
        <h5 className="text-sm font-semibold">{t("timeline.sceneList")}</h5>
        {scenes.isLoading ? (
          <Skeleton className="h-40 w-full rounded-lg" />
        ) : list.length ? (
          <ol className="space-y-2">
            {list.map((scene, index) => (
              <li key={scene.id} className="flex items-center gap-3 rounded-lg border p-3">
                <Badge variant="outline" className="text-[10px]">
                  {t("timeline.sequence", { number: index + 1 })}
                </Badge>
                <div className="flex-1">
                  <p className="text-sm font-medium">{scene.title}</p>
                  <p className="line-clamp-2 text-xs text-muted-foreground">{scene.synopsis}</p>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={t("timeline.moveUp")}
                  disabled={index === 0 || swap.isPending}
                  onClick={() => swap.mutate({ a: scene, b: list[index - 1]! })}
                >
                  <ChevronUp className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={t("timeline.moveDown")}
                  disabled={index === list.length - 1 || swap.isPending}
                  onClick={() => swap.mutate({ a: scene, b: list[index + 1]! })}
                >
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted-foreground">{t("timeline.noScenes")}</p>
        )}
      </section>
    </div>
  );
}
