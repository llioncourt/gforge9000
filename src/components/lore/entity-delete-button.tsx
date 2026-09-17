import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { deleteEntity } from "@/lib/lore";
import { useT } from "@/i18n/hooks";

export function EntityDeleteButton({
  campaignId,
  entityId,
  name,
}: {
  campaignId: string;
  entityId: string;
  name: string;
}) {
  const { t } = useT("lore");
  const { t: tc } = useT("common");
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const remove = useMutation({
    mutationFn: () => deleteEntity(entityId),
    onSuccess: async () => {
      setOpen(false);
      toast.success(t("entityDelete.toastDeleted"));
      await queryClient.invalidateQueries({ queryKey: ["lore-entities", campaignId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        aria-label={t("entityDelete.deleteAria", { name })}
        className="text-muted-foreground hover:text-destructive size-7 shrink-0"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen(true);
        }}
      >
        <Trash2 className="size-4" />
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("entityDelete.confirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("entityDelete.confirmDescription", { name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc("actions.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => remove.mutate()} disabled={remove.isPending}>
              {tc("actions.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
