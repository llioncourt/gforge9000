import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { KINDS, kindDef } from "@/lib/entity-kinds";
import { applyDraft, buildContext, type AppliedDraft, type LoreDraft } from "@/lib/ai-lore";
import { draftLoreEntry } from "@/lib/ai-lore.functions";
import { createEntity, listEntities } from "@/lib/lore";
import { useT } from "@/i18n/hooks";

export function AiDraftDialog({
  campaignId,
  open,
  onOpenChange,
  initialKind,
}: {
  campaignId: string;
  open: boolean;
  onOpenChange: (value: boolean) => void;
  initialKind: string;
}) {
  const { t } = useT("lore");
  const { t: tc } = useT("common");
  const queryClient = useQueryClient();
  const callDraft = useServerFn(draftLoreEntry);
  const [kind, setKind] = useState(initialKind);
  const [brief, setBrief] = useState("");
  const [draft, setDraft] = useState<AppliedDraft | null>(null);

  const generate = useMutation({
    mutationFn: async () => {
      const rows = await listEntities(campaignId);
      const result = (await callDraft({
        data: { campaignId, kind, brief, context: buildContext(rows) },
      })) as LoreDraft;
      return applyDraft(kind, result);
    },
    onSuccess: (result) => setDraft(result),
    onError: (error: Error) => toast.error(error.message),
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!draft) return;
      await createEntity({
        campaign_id: campaignId,
        kind,
        name: draft.name,
        summary: draft.summary || null,
        status: kindDef(kind).defaultStatus,
        data: draft.data,
      });
    },
    onSuccess: async () => {
      close();
      toast.success(t("aiDraft.toastSaved"));
      await queryClient.invalidateQueries({ queryKey: ["lore-entities", campaignId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function close() {
    onOpenChange(false);
    setDraft(null);
    setBrief("");
  }

  const labels = new Map(kindDef(kind).fields.map((f) => [f.key, f.label]));

  return (
    <Dialog open={open} onOpenChange={(value) => (value ? onOpenChange(true) : close())}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("aiDraft.title")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ai-kind">{t("aiDraft.typeLabel")}</Label>
            <Select
              value={kind}
              onValueChange={(value) => {
                setKind(value);
                setDraft(null);
              }}
            >
              <SelectTrigger id="ai-kind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {KINDS.filter((k) => k.group !== "assets").map((k) => (
                  <SelectItem key={k.kind} value={k.kind}>
                    {k.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ai-brief">{t("aiDraft.briefLabel")}</Label>
            <Textarea
              id="ai-brief"
              rows={4}
              value={brief}
              onChange={(event) => setBrief(event.target.value)}
              placeholder={t("aiDraft.briefPlaceholder")}
            />
            <p className="text-muted-foreground text-xs">{t("aiDraft.briefHint")}</p>
          </div>

          {draft ? (
            <div className="space-y-3 rounded-lg border p-3">
              <div>
                <p className="font-medium">{draft.name}</p>
                <p className="text-muted-foreground text-sm">{draft.summary}</p>
              </div>
              <dl className="space-y-2 text-sm">
                {Object.entries(draft.data).map(([key, value]) => (
                  <div key={key}>
                    <dt className="text-muted-foreground text-xs uppercase">
                      {labels.get(key) ?? key}
                    </dt>
                    <dd className="whitespace-pre-wrap">
                      {Array.isArray(value) ? value.join(", ") : value}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            {tc("actions.cancel")}
          </Button>
          <Button
            variant="outline"
            onClick={() => generate.mutate()}
            disabled={generate.isPending || brief.trim().length < 3}
          >
            <Sparkles className="mr-2 size-4" />
            {generate.isPending
              ? t("aiDraft.generating")
              : draft
                ? t("aiDraft.tryAgain")
                : t("aiDraft.generate")}
          </Button>
          <Button onClick={() => save.mutate()} disabled={!draft || save.isPending}>
            {t("aiDraft.saveEntry")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
