import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clapperboard, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useFormatters, useT } from "@/i18n/hooks";
import {
  createAdaptation,
  deleteAdaptation,
  listAdaptations,
  updateAdaptation,
  type AdaptationProject,
} from "@/lib/adaptation/api";
import { AdaptationWizard } from "@/components/adaptation/adaptation-wizard";

/** GM-only entry point: the list of adaptations for this campaign. */
export function AdaptationPanel({ campaignId }: { campaignId: string }) {
  const { t } = useT("adaptation");
  const { t: tc } = useT("common");
  const f = useFormatters();
  const queryClient = useQueryClient();

  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<AdaptationProject | null>(null);
  const [removing, setRemoving] = useState<AdaptationProject | null>(null);
  const [name, setName] = useState("");

  const adaptations = useQuery({
    queryKey: ["adaptations", campaignId],
    queryFn: () => listAdaptations(campaignId),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["adaptations", campaignId] });

  const create = useMutation({
    mutationFn: () => createAdaptation({ campaign_id: campaignId, name: name.trim() }),
    onSuccess: (project) => {
      setCreating(false);
      setName("");
      invalidate();
      toast.success(t("panel.toasts.created"));
      setOpenId(project.id);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const rename = useMutation({
    mutationFn: () => updateAdaptation(renaming!.id, { name: name.trim() }),
    onSuccess: () => {
      setRenaming(null);
      setName("");
      invalidate();
      toast.success(t("panel.toasts.renamed"));
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: () => deleteAdaptation(removing!.id),
    onSuccess: () => {
      setRemoving(null);
      invalidate();
      toast.success(t("panel.toasts.deleted"));
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const open = adaptations.data?.find((project) => project.id === openId) ?? null;
  if (open) {
    return (
      <AdaptationWizard
        project={open}
        onClose={() => {
          setOpenId(null);
          invalidate();
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="panel flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <Clapperboard className="h-4 w-4 text-muted-foreground" />
        <div className="flex-1">
          <h3 className="font-display text-base font-semibold">{t("panel.title")}</h3>
          <p className="text-sm text-muted-foreground">{t("panel.subtitle")}</p>
        </div>
        <Button
          onClick={() => {
            setName("");
            setCreating(true);
          }}
        >
          <Plus className="mr-1 h-4 w-4" /> {t("panel.newButton")}
        </Button>
      </div>

      {adaptations.isLoading ? (
        <div className="space-y-3">
          {[0, 1].map((index) => (
            <Skeleton key={index} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      ) : adaptations.data?.length ? (
        <div className="space-y-3">
          {adaptations.data.map((project) => (
            <article
              key={project.id}
              className="panel flex flex-col gap-3 p-4 sm:flex-row sm:items-center"
            >
              <div className="flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="font-display text-base font-semibold">{project.name}</h4>
                  <Badge variant="outline" className="text-[10px]">
                    {t(`panel.status.${project.status}`)}
                  </Badge>
                  {project.target_comic ? (
                    <Badge variant="secondary" className="text-[10px]">
                      {t("wizard.targetComic")}
                    </Badge>
                  ) : null}
                  {project.target_movie ? (
                    <Badge variant="secondary" className="text-[10px]">
                      {t("wizard.targetMovie")}
                    </Badge>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("panel.updated", { when: f.date(project.updated_at) })}
                </p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => setOpenId(project.id)}>
                  {t("panel.openButton")}
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={t("panel.renameButton")}
                  onClick={() => {
                    setName(project.name);
                    setRenaming(project);
                  }}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={t("panel.deleteButton")}
                  onClick={() => setRemoving(project)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{t("panel.empty")}</p>
      )}

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("panel.createDialog.title")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="adaptation-name">{t("panel.createDialog.nameLabel")}</Label>
            <Input
              id="adaptation-name"
              value={name}
              placeholder={t("panel.createDialog.namePlaceholder")}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreating(false)}>
              {tc("actions.cancel")}
            </Button>
            <Button disabled={!name.trim() || create.isPending} onClick={() => create.mutate()}>
              {t("panel.createDialog.submit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!renaming} onOpenChange={(next) => !next && setRenaming(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("panel.renameDialog.title")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="adaptation-rename">{t("panel.renameDialog.nameLabel")}</Label>
            <Input
              id="adaptation-rename"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenaming(null)}>
              {tc("actions.cancel")}
            </Button>
            <Button disabled={!name.trim() || rename.isPending} onClick={() => rename.mutate()}>
              {t("panel.renameDialog.submit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!removing} onOpenChange={(next) => !next && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("panel.deleteDialog.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("panel.deleteDialog.description", { name: removing?.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc("actions.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => remove.mutate()}>
              {t("panel.deleteDialog.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
