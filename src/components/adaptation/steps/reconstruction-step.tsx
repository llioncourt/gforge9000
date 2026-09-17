import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/i18n/hooks";
import { upsertFacts, upsertScenes } from "@/lib/adaptation/api";
import { runReconstruction, type ReconstructionResult } from "@/lib/adaptation/pipeline";
import { scanCampaign, type ScanScope } from "@/lib/adaptation/scanner";
import type { StepProps } from "@/components/adaptation/adaptation-wizard";

export function ReconstructionStep({ project, patch }: StepProps) {
  const { t } = useT("adaptation");
  const queryClient = useQueryClient();
  const [instructions, setInstructions] = useState("");
  const [progress, setProgress] = useState<{ label: string; percent: number } | null>(null);
  const [result, setResult] = useState<ReconstructionResult | null>(null);

  const run = useMutation({
    mutationFn: async () => {
      await patch({ status: "reconstructing" });
      const snapshot = await scanCampaign(
        project.campaign_id,
        (project.source_scope ?? {}) as ScanScope,
        project.source_mode,
      );
      const output = await runReconstruction(
        project.id,
        snapshot,
        {
          spoilerPolicy: project.spoiler_policy,
          ...(instructions.trim() ? { instructions: instructions.trim() } : {}),
        },
        (value) =>
          setProgress({
            label: value.label,
            percent: Math.round((value.chunk / Math.max(1, value.chunks)) * 100),
          }),
      );

      if (output.facts.length) await upsertFacts(project.id, output.facts);
      if (output.scenes.length) await upsertScenes(project.id, output.scenes);
      await patch({ status: "reviewing" });
      return output;
    },
    onSuccess: (output) => {
      setProgress(null);
      setResult(output);
      queryClient.invalidateQueries({ queryKey: ["adaptation-facts", project.id] });
      queryClient.invalidateQueries({ queryKey: ["adaptation-scenes", project.id] });
      toast.success(t("reconstruction.toasts.done"));
    },
    onError: (error: Error) => {
      setProgress(null);
      toast.error(error.message);
    },
  });

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h4 className="font-display text-base font-semibold">{t("reconstruction.title")}</h4>
        <p className="text-sm text-muted-foreground">{t("reconstruction.description")}</p>
      </header>

      <div className="space-y-2">
        <Label htmlFor="reconstruction-instructions">{t("reconstruction.instructionsLabel")}</Label>
        <Textarea
          id="reconstruction-instructions"
          rows={4}
          value={instructions}
          placeholder={t("reconstruction.instructionsPlaceholder")}
          onChange={(event) => setInstructions(event.target.value)}
        />
      </div>

      <Button disabled={run.isPending} onClick={() => run.mutate()}>
        <Sparkles className="mr-1 h-4 w-4" />
        {run.isPending ? t("reconstruction.running") : t("reconstruction.runButton")}
      </Button>

      {run.isPending ? <Progress value={progress?.percent ?? 0} /> : null}

      {result ? (
        <section className="space-y-2 rounded-lg border p-3">
          <h5 className="text-sm font-semibold">{t("reconstruction.resultsTitle")}</h5>
          <p className="text-sm">{t("reconstruction.factsFound", { count: result.facts.length })}</p>
          <p className="text-sm">{t("reconstruction.scenesFound", { count: result.scenes.length })}</p>
          {result.failures.length ? (
            <div className="space-y-1">
              <h6 className="text-xs font-semibold uppercase text-muted-foreground">
                {t("reconstruction.failuresTitle")}
              </h6>
              <ul className="space-y-1 text-sm text-muted-foreground">
                {result.failures.map((failure, index) => (
                  <li key={`${failure.stage}-${index}`}>
                    {failure.stage}: {failure.message}
                  </li>
                ))}
              </ul>
              <Button size="sm" variant="outline" onClick={() => run.mutate()}>
                {t("reconstruction.retryFailed")}
              </Button>
            </div>
          ) : null}
        </section>
      ) : (
        <p className="text-sm text-muted-foreground">{t("reconstruction.noRunYet")}</p>
      )}
    </div>
  );
}
