import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { NotebookPen } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/hooks/use-session";
import { useT } from "@/i18n/hooks";
import { addNote } from "@/lib/api";

/**
 * The "add an entry" form of a campaign's Story notes. Used in the campaign's
 * Story tab and, through `StoryNoteButton`, straight from a character sheet.
 *
 * Visibility is one stored flag with two readings:
 * - for the GM it is "GM only", as it always was;
 * - for a player it is "Private": only the author and the GM can read it.
 */
export function StoryNoteForm({
  campaignId,
  isGm,
  idPrefix = "story-note",
  onAdded,
}: {
  campaignId: string;
  isGm: boolean;
  /** Keeps field ids unique when the form appears more than once on a page. */
  idPrefix?: string;
  onAdded?: () => void;
}) {
  const { t } = useT("campaigns");
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [kind, setKind] = useState("note");
  const [restricted, setRestricted] = useState(false);

  const create = useMutation({
    mutationFn: () =>
      addNote({
        campaign_id: campaignId,
        title,
        body,
        kind,
        gm_only: restricted,
      } as never),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["notes", campaignId] });
      setTitle("");
      setBody("");
      toast.success(t("notes.addEntry.added"));
      onAdded?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const switchId = `${idPrefix}-restricted`;

  return (
    <div className="space-y-3">
      <Input
        placeholder={t("notes.addEntry.titlePlaceholder")}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <Textarea
        rows={5}
        placeholder={t("notes.addEntry.bodyPlaceholder")}
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <Select value={kind} onValueChange={setKind}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="note">{t("notes.kinds.note")}</SelectItem>
          <SelectItem value="handout">{t("notes.kinds.handout")}</SelectItem>
          <SelectItem value="session">{t("notes.kinds.session")}</SelectItem>
          <SelectItem value="npc">{t("notes.kinds.npc")}</SelectItem>
          <SelectItem value="party-inventory">{t("notes.kinds.partyInventory")}</SelectItem>
        </SelectContent>
      </Select>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <Label htmlFor={switchId}>
            {isGm ? t("notes.addEntry.gmOnlyLabel") : t("notes.addEntry.privateLabel")}
          </Label>
          {isGm ? null : (
            <p className="text-xs text-muted-foreground">
              {restricted ? t("notes.addEntry.privateHint") : t("notes.addEntry.publicHint")}
            </p>
          )}
        </div>
        <Switch id={switchId} checked={restricted} onCheckedChange={setRestricted} />
      </div>
      <Button
        className="w-full"
        onClick={() => create.mutate()}
        disabled={!title || create.isPending}
      >
        {t("notes.addEntry.submit")}
      </Button>
    </div>
  );
}

/**
 * Notepad button for a character sheet: opens the Story note form in a dialog,
 * so a player can add to the campaign's Story without leaving the sheet.
 */
export function StoryNoteButton({
  campaignId,
  gmId,
}: {
  campaignId: string;
  /** The campaign's GM, once known; decides which visibility wording is shown. */
  gmId: string | null | undefined;
}) {
  const { t } = useT("campaigns");
  const { user } = useSession();
  const [open, setOpen] = useState(false);
  const isGm = !!user && !!gmId && gmId === user.id;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={() => setOpen(true)}
        aria-label={t("notes.fromSheet.buttonAria")}
        title={t("notes.fromSheet.buttonAria")}
      >
        <NotebookPen className="h-4 w-4" />
        {t("notes.fromSheet.button")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("notes.fromSheet.title")}</DialogTitle>
            <DialogDescription>{t("notes.fromSheet.description")}</DialogDescription>
          </DialogHeader>
          <StoryNoteForm
            campaignId={campaignId}
            isGm={isGm}
            idPrefix="sheet-story-note"
            onAdded={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
