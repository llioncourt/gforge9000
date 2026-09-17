import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Download } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useT } from "@/i18n/hooks";
import { listAdaptationAssets, listFacts, listScenes } from "@/lib/adaptation/api";
import { exportAdaptationBundle, exportProjectionBundle } from "@/lib/adaptation/bundle";
import type { StepProps } from "@/components/adaptation/adaptation-wizard";

interface Problem {
  key: string;
  count: number;
  /** Where the user goes to sort this one out. */
  step: WizardStep;
  /** Ids of the pending facts, when a one-click confirm makes sense. */
  factIds?: string[];
}

function useProblems(projectId: string, project: StepProps["project"]) {
  const facts = useQuery({ queryKey: ["adaptation-facts", projectId], queryFn: () => listFacts(projectId) });
  const scenes = useQuery({ queryKey: ["adaptation-scenes", projectId], queryFn: () => listScenes(projectId) });
  const assets = useQuery({
    queryKey: ["adaptation-assets", projectId],
    queryFn: () => listAdaptationAssets(projectId),
  });

  const loading = facts.isLoading || scenes.isLoading || assets.isLoading;
  const problems: Problem[] = [];
  if (!loading) {
    if (!(scenes.data ?? []).length)
      problems.push({ key: "noScenes", count: 0, step: "reconstruction" });
    const unresolvedFacts = (facts.data ?? []).filter((fact) => fact.canon_status === "needs_review");
    if (unresolvedFacts.length)
      problems.push({
        key: "unresolvedFacts",
        count: unresolvedFacts.length,
        step: "canon",
        factIds: unresolvedFacts.map((fact) => fact.id),
      });
    const conflicts = (facts.data ?? []).filter((fact) => fact.provenance_type === "conflict");
    if (conflicts.length) problems.push({ key: "conflicts", count: conflicts.length, step: "canon" });
    const unresolvedAssets = (assets.data ?? []).filter(
      (asset) => asset.resolution_status === "unresolved" || asset.resolution_status === "ambiguous",
    );
    if (unresolvedAssets.length)
      problems.push({ key: "unresolvedAssets", count: unresolvedAssets.length, step: "assets" });
    if (project.target_comic && !project.creative_settings?.comic?.series_title)
      problems.push({ key: "noComicConfig", count: 0, step: "comic" });
    if (project.target_movie && !project.creative_settings?.movie?.title)
      problems.push({ key: "noMovieConfig", count: 0, step: "movie" });
  }
  return { loading, problems };
}

/** Shared issue list: every entry offers the shortest route to clearing it. */
function ProblemList({
  problems,
  projectId,
  goTo,
}: {
  problems: Problem[];
  projectId: string;
  goTo: StepProps["goTo"];
}) {
  const { t } = useT("adaptation");
  const queryClient = useQueryClient();

  const confirmAll = useMutation({
    mutationFn: async (ids: string[]) => {
      for (const id of ids) await reviewFact(id, "confirmed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adaptation-facts", projectId] });
      toast.success(t("validation.actions.confirmedAll"));
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <ul className="space-y-2 text-sm">
      {problems.map((problem) => (
        <li
          key={problem.key}
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2"
        >
          <span>
            {String(t(`validation.checks.${problem.key}` as never, { count: problem.count } as never))}
          </span>
          <span className="flex items-center gap-2">
            {problem.factIds?.length ? (
              <Button
                size="sm"
                variant="secondary"
                disabled={confirmAll.isPending}
                onClick={() => confirmAll.mutate(problem.factIds!)}
              >
                {t("validation.actions.confirmAll")}
              </Button>
            ) : null}
            <Button size="sm" variant="outline" onClick={() => goTo(problem.step)}>
              <Wrench className="mr-1 h-4 w-4" /> {t("validation.actions.fix")}
            </Button>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function ValidationStep({ project }: StepProps) {
  const { t } = useT("adaptation");
  const { loading, problems } = useProblems(project.id, project);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h4 className="font-display text-base font-semibold">{t("validation.title")}</h4>
        <p className="text-sm text-muted-foreground">{t("validation.description")}</p>
      </header>

      {loading ? (
        <Skeleton className="h-32 w-full rounded-lg" />
      ) : problems.length ? (
        <section className="space-y-2">
          <h5 className="flex items-center gap-2 text-sm font-semibold">
            <AlertTriangle className="h-4 w-4 text-amber-500" /> {t("validation.problemsTitle")}
          </h5>
          <ul className="space-y-1 text-sm">
            {problems.map((problem) => (
              <li key={problem.key}>{String(t(`validation.checks.${problem.key}` as never, { count: problem.count } as never))}</li>
            ))}
          </ul>
        </section>
      ) : (
        <p className="flex items-center gap-2 text-sm">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" /> {t("validation.noProblems")}
        </p>
      )}
    </div>
  );
}

export function GenerateStep({ project, patch }: StepProps) {
  const { t } = useT("adaptation");
  const { problems } = useProblems(project.id, project);
  const [running, setRunning] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  const download = (bytes: Uint8Array, fileName: string) => {
    const blob = new Blob([bytes as unknown as BlobPart], { type: "application/zip" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  };

  const run = async (kind: "bundle" | "comic" | "movie") => {
    setRunning(kind);
    setProgress(0);
    try {
      const onProgress = (step: { percent: number }) => setProgress(step.percent);
      if (kind === "bundle") {
        const out = await exportAdaptationBundle(project, onProgress);
        download(out.bytes, out.fileName);
        if (out.problems.length) toast.warning(out.problems[0]!);
      } else {
        const out = await exportProjectionBundle(project, kind, onProgress);
        download(out.bytes, out.fileName);
      }
      await patch({ status: "generated" });
      toast.success(t("generate.toasts.exported"));
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setRunning(null);
    }
  };

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h4 className="font-display text-base font-semibold">{t("generate.title")}</h4>
        <p className="text-sm text-muted-foreground">{t("generate.description")}</p>
      </header>

      {problems.length ? (
        <p className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
          <AlertTriangle className="h-4 w-4" /> {t("generate.problemsWarning")}
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <article className="space-y-2 rounded-lg border p-3">
          <h5 className="text-sm font-semibold">{t("generate.bundleTitle")}</h5>
          <p className="text-xs text-muted-foreground">{t("generate.bundleDescription")}</p>
          <Button size="sm" disabled={!!running} onClick={() => void run("bundle")}>
            <Download className="mr-1 h-4 w-4" /> {t("generate.bundleButton")}
          </Button>
        </article>

        <article className="space-y-2 rounded-lg border p-3">
          <h5 className="text-sm font-semibold">{t("generate.comicTitle")}</h5>
          <p className="text-xs text-muted-foreground">{t("generate.comicDescription")}</p>
          <Button
            size="sm"
            disabled={!!running || !project.target_comic}
            onClick={() => void run("comic")}
          >
            <Download className="mr-1 h-4 w-4" /> {t("generate.comicButton")}
          </Button>
        </article>

        <article className="space-y-2 rounded-lg border p-3">
          <h5 className="text-sm font-semibold">{t("generate.movieTitle")}</h5>
          <p className="text-xs text-muted-foreground">{t("generate.movieDescription")}</p>
          <Button
            size="sm"
            disabled={!!running || !project.target_movie}
            onClick={() => void run("movie")}
          >
            <Download className="mr-1 h-4 w-4" /> {t("generate.movieButton")}
          </Button>
        </article>
      </div>

      <Dialog open={!!running}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("generate.exporting")}</DialogTitle>
            <DialogDescription>{t("generate.description")}</DialogDescription>
          </DialogHeader>
          <Progress value={progress} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
