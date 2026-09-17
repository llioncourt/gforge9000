import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Plus, Save, Sparkles, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { FileDropzone } from "@/components/ui/FileDropzone";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { listNotes, type NoteRow } from "@/lib/api";
import { ASSET_BUCKET, uploadAssetFile } from "@/lib/assets";
import { listAdaptations } from "@/lib/adaptation/api";
import { runAdaptationStage } from "@/lib/adaptation/ai.functions";
import type { StageResult } from "@/lib/adaptation/ai-schemas";
import { CHRONICLE_ITEM_TYPES, type ChronicleItemType } from "@/lib/adaptation/types";
import {
  addSessionChronicleItems,
  createSessionChronicle,
  deleteSessionChronicle,
  deleteSessionChronicleItem,
  listSessionChronicleItems,
  listSessionChronicles,
  updateSessionChronicle,
  updateSessionChronicleItem,
  type SessionChronicle,
  type SessionChronicleItem,
} from "@/lib/adaptation/chronicle-api";
import { useT, useFormatters } from "@/i18n/hooks";

/** Reads a dropped transcript file, extracting sensibly from JSON when possible. */
async function extractTranscriptText(file: File): Promise<string> {
  const raw = await file.text();
  if (!file.name.toLowerCase().endsWith(".json")) return raw;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === "string") return parsed;
    if (Array.isArray(parsed)) {
      return parsed
        .map((entry) => {
          if (typeof entry === "string") return entry;
          if (entry && typeof entry === "object") {
            const record = entry as Record<string, unknown>;
            const speaker = record["speaker"] ?? record["name"] ?? record["author"];
            const text = record["text"] ?? record["line"] ?? record["content"] ?? record["message"];
            if (typeof text === "string") {
              return speaker ? `${String(speaker)}: ${text}` : text;
            }
          }
          return JSON.stringify(entry);
        })
        .join("\n");
    }
    if (parsed && typeof parsed === "object") {
      const record = parsed as Record<string, unknown>;
      const candidate = record["transcript"] ?? record["text"] ?? record["content"];
      if (typeof candidate === "string") return candidate;
    }
    return raw;
  } catch {
    return raw;
  }
}

export function SessionChroniclePanel({ campaignId, isGm }: { campaignId: string; isGm: boolean }) {
  const { t } = useT("adaptation");
  const { t: tc } = useT("common");
  const f = useFormatters();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState("");
  const [sessionNo, setSessionNo] = useState("");
  const [playedOn, setPlayedOn] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [removing, setRemoving] = useState<SessionChronicle | null>(null);
  const [importing, setImporting] = useState(false);
  const [addingMaterial, setAddingMaterial] = useState(false);

  const chronicles = useQuery({
    queryKey: ["session-chronicles", campaignId],
    queryFn: () => listSessionChronicles(campaignId),
    enabled: isGm,
  });

  const selected = useMemo(
    () => (chronicles.data ?? []).find((c) => c.id === selectedId) ?? null,
    [chronicles.data, selectedId],
  );

  const notes = useQuery({
    queryKey: ["notes", campaignId],
    queryFn: () => listNotes(campaignId),
    enabled: isGm,
  });

  const items = useQuery({
    queryKey: ["session-chronicle-items", selected?.id],
    queryFn: () => listSessionChronicleItems(selected!.id),
    enabled: isGm && !!selected,
  });

  const adaptations = useQuery({
    queryKey: ["adaptations", campaignId],
    queryFn: () => listAdaptations(campaignId),
    enabled: isGm,
  });
  const latestAdaptation = useMemo(
    () => (adaptations.data ?? [])[0] ?? null,
    [adaptations.data],
  );

  const invalidateChronicles = () =>
    queryClient.invalidateQueries({ queryKey: ["session-chronicles", campaignId] });
  const invalidateItems = () =>
    queryClient.invalidateQueries({ queryKey: ["session-chronicle-items", selected?.id] });

  const create = useMutation({
    mutationFn: () =>
      createSessionChronicle({
        campaign_id: campaignId,
        title: title.trim() || t("chronicle.titleLabel"),
        session_no: sessionNo.trim() ? Number(sessionNo) : null,
        played_on: playedOn.trim() || null,
      }),
    onSuccess: (row) => {
      setTitle("");
      setSessionNo("");
      setPlayedOn("");
      setSelectedId(row.id);
      invalidateChronicles();
      toast.success(t("chronicle.toasts.created"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (row: SessionChronicle) => deleteSessionChronicle(row.id),
    onSuccess: () => {
      setRemoving(null);
      if (selectedId === removing?.id) setSelectedId(null);
      invalidateChronicles();
      toast.success(t("chronicle.toasts.deleted"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const patch = useMutation({
    mutationFn: (input: { id: string; patch: Partial<SessionChronicle> }) =>
      updateSessionChronicle(input.id, input.patch),
    onSuccess: () => {
      invalidateChronicles();
      toast.success(t("chronicle.saved"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reviewItem = useMutation({
    mutationFn: (input: { id: string; patch: Partial<SessionChronicleItem> }) =>
      updateSessionChronicleItem(input.id, input.patch),
    onSuccess: () => {
      invalidateItems();
      toast.success(t("chronicle.toasts.itemUpdated"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeItem = useMutation({
    mutationFn: (id: string) => deleteSessionChronicleItem(id),
    onSuccess: () => invalidateItems(),
    onError: (e: Error) => toast.error(e.message),
  });

  const runReconstruction = useMutation({
    mutationFn: async () => {
      if (!selected || !latestAdaptation) return;
      const context = [selected.transcript, selected.raw_notes].filter(Boolean).join("\n\n---\n\n");
      const response = (await runAdaptationStage({
        data: {
          adaptation_id: latestAdaptation.id,
          stage: "facts",
          context: context || " ",
          chunk_index: 0,
          chunk_total: 1,
        },
      })) as { result: StageResult<"facts"> };
      const existing = items.data ?? [];
      const nextSequence = existing.length
        ? Math.max(...existing.map((i) => i.sequence_no)) + 1
        : 0;
      const rows = response.result.facts.map((fact, index: number) => ({
        chronicle_id: selected.id,
        campaign_id: campaignId,
        item_type: "ai_reconstruction" as ChronicleItemType,
        sequence_no: nextSequence + index,
        summary: fact.statement,
        detail: fact.statement,
        subject_entity_id: null,
        character_id: null,
        provenance_type: fact.provenance_type,
        source_refs: [],
        review_status: "needs_review" as const,
        gm_only: fact.gm_only,
        data: {},
      }));
      await addSessionChronicleItems(rows);
    },
    onSuccess: () => {
      invalidateItems();
      toast.success(t("chronicle.toasts.reconstructed"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!isGm) return null;

  const noteById = (id: string | null): NoteRow | null =>
    id ? (notes.data ?? []).find((n) => n.id === id) ?? null : null;

  const grouped = useMemo(() => {
    const map = new Map<ChronicleItemType, SessionChronicleItem[]>();
    for (const type of CHRONICLE_ITEM_TYPES) map.set(type, []);
    for (const item of items.data ?? []) map.get(item.item_type)?.push(item);
    return map;
  }, [items.data]);

  return (
    <div className="space-y-6">
      <div className="panel flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <CalendarDays className="h-4 w-4 text-muted-foreground" />
        <p className="flex-1 text-sm text-muted-foreground">{t("chronicle.intro")}</p>
        <div className="flex flex-wrap gap-2">
          <Input
            className="sm:w-48"
            placeholder={t("chronicle.titleLabel")}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <Input
            type="number"
            className="sm:w-32"
            placeholder={t("chronicle.sessionNoLabel")}
            value={sessionNo}
            onChange={(e) => setSessionNo(e.target.value)}
          />
          <Input
            type="date"
            className="sm:w-40"
            placeholder={t("chronicle.playedOnLabel")}
            value={playedOn}
            onChange={(e) => setPlayedOn(e.target.value)}
          />
          <Button onClick={() => create.mutate()} disabled={create.isPending}>
            <Plus className="mr-1 h-4 w-4" /> {t("chronicle.newButton")}
          </Button>
        </div>
      </div>

      {chronicles.isLoading ? (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      ) : (chronicles.data ?? []).length ? (
        <div className="flex flex-wrap gap-2">
          {(chronicles.data ?? []).map((chronicle) => (
            <div
              key={chronicle.id}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                selectedId === chronicle.id ? "border-primary bg-accent/30" : ""
              }`}
            >
              <button
                type="button"
                className="text-left"
                onClick={() => setSelectedId(chronicle.id)}
              >
                <span className="font-medium">{chronicle.title}</span>
                {chronicle.played_on ? (
                  <Badge variant="outline" className="ml-2 text-[10px]">
                    {f.date(chronicle.played_on)}
                  </Badge>
                ) : null}
              </button>
              <Button
                size="icon"
                variant="ghost"
                aria-label={tc("actions.delete")}
                onClick={() => setRemoving(chronicle)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      ) : null}

      {selected ? (
        <ChronicleDetail
          campaignId={campaignId}
          chronicle={selected}
          prepNote={noteById(selected.prep_note_id)}
          recapNote={noteById(selected.recap_note_id)}
          notesLoading={notes.isLoading}
          onPatch={(p) => patch.mutate({ id: selected.id, patch: p })}
          importing={importing}
          setImporting={setImporting}
          addingMaterial={addingMaterial}
          setAddingMaterial={setAddingMaterial}
          items={items}
          grouped={grouped}
          onReviewItem={(id, p) => reviewItem.mutate({ id, patch: p })}
          onRemoveItem={(id) => removeItem.mutate(id)}
          canRun={!!latestAdaptation}
          running={runReconstruction.isPending}
          onRun={() => runReconstruction.mutate()}
        />
      ) : null}

      <AlertDialog open={!!removing} onOpenChange={(open) => !open && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("chronicle.deleteDialog.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("chronicle.deleteDialog.description", { title: removing?.title })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc("actions.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => removing && remove.mutate(removing)}>
              {t("chronicle.deleteDialog.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ChronicleDetail({
  campaignId,
  chronicle,
  prepNote,
  recapNote,
  notesLoading,
  onPatch,
  importing,
  setImporting,
  addingMaterial,
  setAddingMaterial,
  items,
  grouped,
  onReviewItem,
  onRemoveItem,
  canRun,
  running,
  onRun,
}: {
  campaignId: string;
  chronicle: SessionChronicle;
  prepNote: NoteRow | null;
  recapNote: NoteRow | null;
  notesLoading: boolean;
  onPatch: (patch: Partial<SessionChronicle>) => void;
  importing: boolean;
  setImporting: (v: boolean) => void;
  addingMaterial: boolean;
  setAddingMaterial: (v: boolean) => void;
  items: ReturnType<typeof useQuery<SessionChronicleItem[]>>;
  grouped: Map<ChronicleItemType, SessionChronicleItem[]>;
  onReviewItem: (id: string, patch: Partial<SessionChronicleItem>) => void;
  onRemoveItem: (id: string) => void;
  canRun: boolean;
  running: boolean;
  onRun: () => void;
}) {
  const { t } = useT("adaptation");
  const { t: tc } = useT("common");
  const [rawNotes, setRawNotes] = useState(chronicle.raw_notes);
  const [transcript, setTranscript] = useState(chronicle.transcript);
  const [approvedRecap, setApprovedRecap] = useState(chronicle.approved_recap);

  const rawNotesDirty = rawNotes !== chronicle.raw_notes;
  const transcriptDirty = transcript !== chronicle.transcript;
  const recapDirty = approvedRecap !== chronicle.approved_recap;

  return (
    <div className="panel space-y-6 p-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("chronicle.linkedPrep")}
          </p>
          {notesLoading ? (
            <Skeleton className="h-6 w-40" />
          ) : prepNote ? (
            <p className="text-sm">{prepNote.title}</p>
          ) : (
            <p className="text-sm text-muted-foreground">{t("chronicle.noLink")}</p>
          )}
        </div>
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("chronicle.linkedRecap")}
          </p>
          {notesLoading ? (
            <Skeleton className="h-6 w-40" />
          ) : recapNote ? (
            <p className="text-sm">{recapNote.title}</p>
          ) : (
            <p className="text-sm text-muted-foreground">{t("chronicle.noLink")}</p>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("chronicle.rawNotesLabel")}
          </p>
          <Textarea
            rows={8}
            placeholder={t("chronicle.rawNotesPlaceholder")}
            value={rawNotes}
            onChange={(e) => setRawNotes(e.target.value)}
          />
          <Button
            size="sm"
            variant="outline"
            disabled={!rawNotesDirty}
            onClick={() => onPatch({ raw_notes: rawNotes })}
          >
            <Save className="mr-1 h-4 w-4" /> {t("chronicle.save")}
          </Button>
        </div>
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("chronicle.transcriptLabel")}
          </p>
          <Textarea
            rows={8}
            placeholder={t("chronicle.transcriptPlaceholder")}
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={!transcriptDirty}
              onClick={() => onPatch({ transcript })}
            >
              <Save className="mr-1 h-4 w-4" /> {t("chronicle.save")}
            </Button>
          </div>
          <FileDropzone
            compact
            accept=".txt,.md,.json"
            loading={importing}
            label={t("chronicle.transcriptImport")}
            hint={t("chronicle.transcriptImportHint")}
            onFiles={async (files) => {
              const file = files[0];
              if (!file) return;
              setImporting(true);
              try {
                const text = await extractTranscriptText(file);
                setTranscript(text);
                onPatch({ transcript: text });
              } catch (e) {
                toast.error((e as Error).message);
              } finally {
                setImporting(false);
              }
            }}
          />
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t("chronicle.materialsLabel")}
        </p>
        {chronicle.materials.length ? (
          <ul className="space-y-1">
            {chronicle.materials.map((material, index) => (
              <li
                key={`${material.path}-${index}`}
                className="flex items-center justify-between rounded-md border px-2 py-1 text-sm"
              >
                <span className="truncate">{material.title}</span>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={tc("actions.delete")}
                  onClick={() =>
                    onPatch({
                      materials: chronicle.materials.filter((_, i) => i !== index),
                    })
                  }
                >
                  <X className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{t("chronicle.materialsEmpty")}</p>
        )}
        <FileDropzone
          compact
          loading={addingMaterial}
          label={t("chronicle.materialsImport")}
          onFiles={async (files) => {
            const file = files[0];
            if (!file) return;
            setAddingMaterial(true);
            try {
              const stored = await uploadAssetFile(campaignId, file);
              onPatch({
                materials: [
                  ...chronicle.materials,
                  {
                    title: file.name,
                    bucket: ASSET_BUCKET,
                    path: stored.path,
                    media_type: stored.mimeType,
                  },
                ],
              });
            } catch (e) {
              toast.error((e as Error).message);
            } finally {
              setAddingMaterial(false);
            }
          }}
        />
      </div>

      <div className="space-y-2 rounded-lg border p-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="font-medium">{t("chronicle.draftTitle")}</p>
            <p className="text-sm text-muted-foreground">{t("chronicle.draftDescription")}</p>
          </div>
          <Button onClick={onRun} disabled={!canRun || running}>
            <Sparkles className="mr-1 h-4 w-4" />
            {running ? t("chronicle.running") : t("chronicle.runButton")}
          </Button>
        </div>
        {!canRun ? <p className="text-sm text-muted-foreground">{t("panel.empty")}</p> : null}
      </div>

      {items.isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {CHRONICLE_ITEM_TYPES.map((type) => (
            <ItemGroup
              key={type}
              type={type}
              rows={grouped.get(type) ?? []}
              onReview={onReviewItem}
              onRemove={onRemoveItem}
            />
          ))}
        </div>
      )}

      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t("chronicle.approvedRecapLabel")}
        </p>
        <Textarea
          rows={8}
          placeholder={t("chronicle.approvedRecapPlaceholder")}
          value={approvedRecap}
          onChange={(e) => setApprovedRecap(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">{t("chronicle.approvedRecapHint")}</p>
        <Button
          size="sm"
          variant="outline"
          disabled={!recapDirty}
          onClick={() => onPatch({ approved_recap: approvedRecap })}
        >
          <Save className="mr-1 h-4 w-4" /> {t("chronicle.save")}
        </Button>
      </div>
    </div>
  );
}

function ItemGroup({
  type,
  rows,
  onReview,
  onRemove,
}: {
  type: ChronicleItemType;
  rows: SessionChronicleItem[];
  onReview: (id: string, patch: Partial<SessionChronicleItem>) => void;
  onRemove: (id: string) => void;
}) {
  const { t } = useT("adaptation");
  return (
    <div className="space-y-2">
      <h4 className="font-display text-sm font-semibold">{t(`chronicle.itemTypes.${type}`)}</h4>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("chronicle.noItems")}</p>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <ItemRow key={row.id} row={row} onReview={onReview} onRemove={onRemove} />
          ))}
        </div>
      )}
    </div>
  );
}

function ItemRow({
  row,
  onReview,
  onRemove,
}: {
  row: SessionChronicleItem;
  onReview: (id: string, patch: Partial<SessionChronicleItem>) => void;
  onRemove: (id: string) => void;
}) {
  const { t } = useT("adaptation");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(row.summary);

  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {editing ? (
            <Textarea rows={3} value={draft} onChange={(e) => setDraft(e.target.value)} />
          ) : (
            <p className="text-sm">{row.summary}</p>
          )}
        </div>
        <Badge variant="outline" className="shrink-0 text-[10px]">
          {t(`chronicle.reviewStatus.${row.review_status}`)}
        </Badge>
      </div>
      <div className="flex flex-wrap gap-2">
        {editing ? (
          <>
            <Button
              size="sm"
              onClick={() => {
                onReview(row.id, { summary: draft, detail: draft });
                setEditing(false);
              }}
            >
              {t("chronicle.save")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              {t("canon.cancel")}
            </Button>
          </>
        ) : (
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onReview(row.id, { review_status: "confirmed" })}
            >
              {t("chronicle.accept")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onReview(row.id, { review_status: "rejected" })}
            >
              {t("chronicle.reject")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
              {t("chronicle.edit")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onRemove(row.id)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
