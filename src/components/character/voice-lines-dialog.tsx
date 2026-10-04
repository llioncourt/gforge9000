import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  GripVertical,
  Loader2,
  MessageSquareText,
  Pause,
  Play,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useT } from "@/i18n/hooks";
import {
  createVoiceLine,
  deleteVoiceLine,
  listVoiceLines,
  reorderVoiceLines,
  speakVoiceLine,
  updateVoiceLine,
  voiceLineUrl,
} from "@/lib/voice-lines.functions";
import type { VoiceLine } from "@/lib/voice-lines.server";

const MAX = 2500;

export function VoiceLinesDialog({
  characterId,
  hasVoice,
  hasKey,
}: {
  characterId: string;
  hasVoice: boolean;
  hasKey: boolean;
}) {
  const { t } = useT("characters");
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <MessageSquareText className="mr-1 size-4" /> {t("voice.lines.open")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("voice.lines.title")}</DialogTitle>
        </DialogHeader>
        {open && <LinesBody characterId={characterId} hasVoice={hasVoice} hasKey={hasKey} />}
      </DialogContent>
    </Dialog>
  );
}

function LinesBody({
  characterId,
  hasVoice,
  hasKey,
}: {
  characterId: string;
  hasVoice: boolean;
  hasKey: boolean;
}) {
  const { t } = useT("characters");
  const qc = useQueryClient();
  const key = ["voice-lines", characterId];
  const list = useServerFn(listVoiceLines);
  const q = useQuery({ queryKey: key, queryFn: () => list({ data: { characterId } }) });
  const createFn = useServerFn(createVoiceLine);
  const reorderFn = useServerFn(reorderVoiceLines);
  const refresh = () => qc.invalidateQueries({ queryKey: key });
  const onError = (e: Error) => toast.error(e.message);

  const [text, setText] = useState("");
  const [label, setLabel] = useState("");
  const create = useMutation({
    mutationFn: (generate: boolean) =>
      createFn({ data: { characterId, text, label: label || null, generate } }),
    onSuccess: () => {
      setText("");
      setLabel("");
      void refresh();
    },
    onError: (e: Error) => {
      onError(e);
      void refresh();
    },
  });
  const reorder = useMutation({
    mutationFn: (orderedIds: string[]) => reorderFn({ data: { characterId, orderedIds } }),
    onSettled: () => void refresh(),
    onError,
  });

  const [dragId, setDragId] = useState<string | null>(null);
  const lines = q.data?.lines ?? [];
  const canEdit = q.data?.canEdit ?? false;
  const canGenerate = hasVoice && hasKey;
  const tooLong = text.length > MAX;

  function drop(targetId: string) {
    if (!dragId || dragId === targetId) return;
    const ids = lines.map((l) => l.id).filter((i) => i !== dragId);
    ids.splice(ids.indexOf(targetId), 0, dragId);
    qc.setQueryData(key, { canEdit, lines: ids.map((i) => lines.find((l) => l.id === i)!) });
    reorder.mutate(ids);
    setDragId(null);
  }

  return (
    <div className="space-y-4">
      {canEdit && (
        <div className="space-y-2 rounded-lg border border-border p-3">
          <Label>{t("voice.lines.new")}</Label>
          <Input
            value={label}
            maxLength={120}
            placeholder={t("voice.lines.label")}
            onChange={(e) => setLabel(e.target.value)}
          />
          <Textarea
            value={text}
            rows={3}
            placeholder={t("voice.linePlaceholder")}
            onChange={(e) => setText(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">{t("voice.lines.tagsHint")}</p>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span className={tooLong ? "text-destructive" : ""}>
              {text.length}/{MAX}
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="ghost"
                disabled={!text.trim() || tooLong || create.isPending}
                onClick={() => create.mutate(false)}
              >
                {t("voice.lines.saveOnly")}
              </Button>
              <Button
                size="sm"
                disabled={!text.trim() || tooLong || !canGenerate || create.isPending}
                onClick={() => create.mutate(true)}
              >
                {create.isPending && <Loader2 className="mr-1 size-4 animate-spin" />}
                {t("voice.lines.saveGenerate")}
              </Button>
            </div>
          </div>
          {tooLong && <p className="text-xs text-destructive">{t("voice.lines.tooLong")}</p>}
          {!hasKey && <p className="text-xs text-muted-foreground">{t("voice.needKey")}</p>}
          {hasKey && !hasVoice && (
            <p className="text-xs text-muted-foreground">{t("voice.lines.noVoice")}</p>
          )}
        </div>
      )}

      {q.isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : q.error ? (
        <p className="text-sm text-destructive">{(q.error as Error).message}</p>
      ) : lines.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("voice.lines.empty")}</p>
      ) : (
        <ul className="space-y-2">
          {lines.map((line) => (
            <li
              key={line.id}
              draggable={canEdit}
              onDragStart={() => setDragId(line.id)}
              onDragOver={(e) => canEdit && e.preventDefault()}
              onDrop={() => drop(line.id)}
              className={`rounded-lg border border-border p-3 ${dragId === line.id ? "opacity-50" : ""}`}
            >
              <LineRow
                line={line}
                canEdit={canEdit}
                canGenerate={canGenerate}
                onChanged={refresh}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function LineRow({
  line,
  canEdit,
  canGenerate,
  onChanged,
}: {
  line: VoiceLine;
  canEdit: boolean;
  canGenerate: boolean;
  onChanged: () => void;
}) {
  const { t } = useT("characters");
  const onError = (e: Error) => toast.error(e.message);
  const updateFn = useServerFn(updateVoiceLine);
  const deleteFn = useServerFn(deleteVoiceLine);
  const speakFn = useServerFn(speakVoiceLine);
  const urlFn = useServerFn(voiceLineUrl);
  const [label, setLabel] = useState(line.label ?? "");
  const [text, setText] = useState(line.text);
  const [playing, setPlaying] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);

  const update = useMutation({
    mutationFn: (patch: { text?: string; label?: string | null; visible?: boolean }) =>
      updateFn({ data: { lineId: line.id, ...patch } }),
    onSuccess: onChanged,
    onError,
  });
  const remove = useMutation({
    mutationFn: () => deleteFn({ data: { lineId: line.id } }),
    onSuccess: onChanged,
    onError,
  });
  const generate = useMutation({
    mutationFn: () => speakFn({ data: { lineId: line.id, regenerate: true } }),
    onSuccess: onChanged,
    onError,
  });
  const play = useMutation({
    mutationFn: () => urlFn({ data: { lineId: line.id } }),
    onSuccess: (r) => {
      audio.current?.pause();
      const a = new Audio(r.audio_url);
      audio.current = a;
      a.onended = () => setPlaying(false);
      setPlaying(true);
      void a.play().catch(() => setPlaying(false));
    },
    onError,
  });

  function toggle() {
    if (playing) {
      audio.current?.pause();
      setPlaying(false);
    } else play.mutate();
  }

  return (
    <div className="flex gap-2">
      {canEdit && (
        <GripVertical
          className="mt-2 size-4 shrink-0 cursor-grab text-muted-foreground"
          aria-label={t("voice.lines.dragHint")}
        />
      )}
      <div className="min-w-0 flex-1 space-y-2">
        {canEdit ? (
          <>
            <Input
              value={label}
              maxLength={120}
              placeholder={t("voice.lines.label")}
              onChange={(e) => setLabel(e.target.value)}
              onBlur={() => label !== (line.label ?? "") && update.mutate({ label: label || null })}
            />
            <Textarea
              value={text}
              rows={2}
              onChange={(e) => setText(e.target.value)}
              onBlur={() => {
                if (text.trim() && text.length <= MAX && text !== line.text)
                  update.mutate({ text });
              }}
            />
          </>
        ) : (
          <>
            {line.label && <p className="text-sm font-medium">{line.label}</p>}
            <p className="whitespace-pre-wrap text-sm">{line.text}</p>
          </>
        )}
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {line.audio_path ? (
            <Button size="sm" variant="secondary" disabled={play.isPending} onClick={toggle}>
              {play.isPending ? (
                <Loader2 className="mr-1 size-4 animate-spin" />
              ) : playing ? (
                <Pause className="mr-1 size-4" />
              ) : (
                <Play className="mr-1 size-4" />
              )}
              {playing ? t("voice.lines.stop") : t("voice.lines.play")}
            </Button>
          ) : (
            <span>{t("voice.lines.noAudio")}</span>
          )}
          {line.duration_seconds != null && line.audio_path && (
            <span>{line.duration_seconds.toFixed(1)}s</span>
          )}
          {line.stale && <Badge variant="outline">{t("voice.lines.stale")}</Badge>}
          {canEdit && (
            <>
              <Button
                size="sm"
                variant="outline"
                disabled={!canGenerate || generate.isPending}
                onClick={() => generate.mutate()}
              >
                {generate.isPending ? (
                  <Loader2 className="mr-1 size-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-1 size-4" />
                )}
                {line.audio_path ? t("voice.lines.regenerate") : t("voice.lines.generate")}
              </Button>
              <label className="flex items-center gap-1">
                <Switch
                  checked={line.visible_to_players}
                  onCheckedChange={(v) => update.mutate({ visible: v })}
                />
                {t("voice.lines.visible")}
              </label>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="icon" variant="ghost" aria-label={t("voice.lines.delete")}>
                    <Trash2 className="size-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t("voice.lines.deleteConfirm")}</AlertDialogTitle>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t("voice.lines.cancel")}</AlertDialogCancel>
                    <AlertDialogAction onClick={() => remove.mutate()}>
                      {t("voice.lines.delete")}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
