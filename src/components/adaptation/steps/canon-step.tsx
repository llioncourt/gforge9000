import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Pencil, X } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/i18n/hooks";
import { editFact, listFacts, reviewFact, type AdaptationFactRow } from "@/lib/adaptation/api";
import { listEntities, updateEntity } from "@/lib/lore";
import type { StepProps } from "@/components/adaptation/adaptation-wizard";

const FILTERS = [
  "all",
  "confirmed",
  "session_derived",
  "ai_inference",
  "adaptation_created",
  "conflict",
] as const;
type Filter = (typeof FILTERS)[number];

export function CanonStep({ project }: StepProps) {
  const { t } = useT("adaptation");
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>("all");
  const [editing, setEditing] = useState<AdaptationFactRow | null>(null);
  const [draft, setDraft] = useState("");

  const facts = useQuery({
    queryKey: ["adaptation-facts", project.id],
    queryFn: () => listFacts(project.id),
  });
  const entities = useQuery({
    queryKey: ["lore-entities", project.campaign_id],
    queryFn: () => listEntities(project.campaign_id),
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["adaptation-facts", project.id] });

  const review = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "confirmed" | "rejected" }) =>
      reviewFact(id, status),
    onSuccess: () => {
      invalidate();
      toast.success(t("canon.toasts.reviewed"));
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const save = useMutation({
    mutationFn: () => editFact(editing!.id, draft.trim()),
    onSuccess: () => {
      setEditing(null);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const applyToCanon = useMutation({
    mutationFn: async () => {
      const confirmed = (facts.data ?? []).filter(
        (fact) => fact.canon_status === "confirmed" && fact.subject_entity_id,
      );
      const byEntity = new Map<string, AdaptationFactRow[]>();
      for (const fact of confirmed) {
        const list = byEntity.get(fact.subject_entity_id!) ?? [];
        list.push(fact);
        byEntity.set(fact.subject_entity_id!, list);
      }
      for (const [entityId, list] of byEntity) {
        const entity = entities.data?.find((candidate) => candidate.id === entityId);
        if (!entity) continue;
        const data = (entity.data ?? {}) as Record<string, unknown>;
        await updateEntity(entityId, {
          data: {
            ...data,
            canon_facts: list.map((fact) => ({
              stable_key: fact.stable_key,
              statement: fact.statement,
              fact_type: fact.fact_type,
            })),
          },
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lore-entities", project.campaign_id] });
      toast.success(t("canon.toasts.applied"));
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const all = facts.data ?? [];
  const visible = all.filter((fact) => {
    if (filter === "all") return true;
    if (filter === "confirmed") return fact.canon_status === "confirmed";
    return fact.provenance_type === filter;
  });

  const counts = {
    confirmed: all.filter((fact) => fact.canon_status === "confirmed").length,
    needsReview: all.filter((fact) => fact.canon_status === "needs_review").length,
    rejected: all.filter((fact) => fact.canon_status === "rejected").length,
    conflicts: all.filter((fact) => fact.provenance_type === "conflict").length,
  };

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h4 className="font-display text-base font-semibold">{t("canon.title")}</h4>
        <p className="text-sm text-muted-foreground">{t("canon.description")}</p>
      </header>

      <div className="flex flex-wrap gap-2 text-xs">
        <Badge variant="secondary">
          {t("canon.counts.confirmed")}: {counts.confirmed}
        </Badge>
        <Badge variant="secondary">
          {t("canon.counts.needsReview")}: {counts.needsReview}
        </Badge>
        <Badge variant="secondary">
          {t("canon.counts.rejected")}: {counts.rejected}
        </Badge>
        <Badge variant="secondary">
          {t("canon.counts.conflicts")}: {counts.conflicts}
        </Badge>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((value) => (
          <Button
            key={value}
            size="sm"
            variant={filter === value ? "default" : "outline"}
            onClick={() => setFilter(value)}
          >
            {t(`canon.filters.${value}`)}
          </Button>
        ))}
      </div>

      {facts.isLoading ? (
        <Skeleton className="h-64 w-full rounded-lg" />
      ) : visible.length ? (
        <ScrollArea className="h-[28rem] rounded-lg border p-3">
          <ul className="space-y-3">
            {visible.map((fact) => {
              const subject = entities.data?.find((entity) => entity.id === fact.subject_entity_id);
              return (
                <li key={fact.id} className="space-y-2 rounded-lg border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{subject?.name ?? t("canon.noSubject")}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {t(`canon.filters.${fact.provenance_type}` as never, {
                        defaultValue: fact.provenance_type,
                      })}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      {t(`canon.counts.${fact.canon_status === "needs_review" ? "needsReview" : fact.canon_status}`)}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">
                      {t("canon.confidence", { value: Math.round((fact.confidence ?? 0) * 100) })}
                    </span>
                  </div>

                  {editing?.id === fact.id ? (
                    <div className="space-y-2">
                      <Textarea
                        rows={3}
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                      />
                      <div className="flex gap-2">
                        <Button size="sm" disabled={save.isPending} onClick={() => save.mutate()}>
                          {t("canon.save")}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setEditing(null)}>
                          {t("canon.cancel")}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm">{fact.statement}</p>
                  )}

                  <p className="text-[10px] text-muted-foreground">
                    {t("canon.sourcesLabel")}:{" "}
                    {(fact.source_refs as { label?: string }[])
                      .map((ref) => ref.label)
                      .filter(Boolean)
                      .join(", ")}
                  </p>

                  {editing?.id === fact.id ? null : (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => review.mutate({ id: fact.id, status: "confirmed" })}
                      >
                        <Check className="mr-1 h-3.5 w-3.5" /> {t("canon.accept")}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => review.mutate({ id: fact.id, status: "rejected" })}
                      >
                        <X className="mr-1 h-3.5 w-3.5" /> {t("canon.reject")}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setDraft(fact.statement);
                          setEditing(fact);
                        }}
                      >
                        <Pencil className="mr-1 h-3.5 w-3.5" /> {t("canon.edit")}
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </ScrollArea>
      ) : (
        <p className="text-sm text-muted-foreground">{t("canon.empty")}</p>
      )}

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button disabled={!counts.confirmed || applyToCanon.isPending}>
            {t("canon.applyToCanon")}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("canon.applyDialog.title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("canon.applyDialog.description")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("canon.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => applyToCanon.mutate()}>
              {t("canon.applyDialog.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
