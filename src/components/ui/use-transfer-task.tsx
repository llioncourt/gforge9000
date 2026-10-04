import { useCallback, useRef, useState } from "react";
import { useT } from "@/i18n/hooks";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  TransferBody,
  type TransferReport,
  type TransferState,
} from "@/components/ui/transfer-dialog";

/**
 * Runs an import/export task inside its own modal with a real progress bar.
 * Render `node` once in the component and call `run(...)` from a button.
 */
export function useTransferTask() {
  const { t } = useT();
  const [state, setState] = useState<TransferState | null>(null);
  const creep = useRef<number | null>(null);

  const stopCreep = () => {
    if (creep.current !== null) {
      window.clearInterval(creep.current);
      creep.current = null;
    }
  };

  const run = useCallback(
    async (title: string, task: (report: TransferReport) => Promise<string>) => {
      setState({
        title,
        label: t("transfer.starting"),
        percent: 0,
        phase: "running",
        message: null,
      });
      stopCreep();
      // When a task reports steps without a percentage, creep towards 90%.
      creep.current = window.setInterval(() => {
        setState((current) =>
          current && current.phase === "running" && current.percent < 90
            ? { ...current, percent: current.percent + Math.max(0.5, (90 - current.percent) / 25) }
            : current,
        );
      }, 220);
      try {
        const message = await task((label, percent) =>
          setState((current) =>
            current
              ? { ...current, label, percent: percent === undefined ? current.percent : percent }
              : current,
          ),
        );
        stopCreep();
        setState((current) =>
          current ? { ...current, phase: "done", percent: 100, message } : current,
        );
      } catch (error) {
        stopCreep();
        setState((current) =>
          current
            ? {
                ...current,
                phase: "error",
                message: error instanceof Error ? error.message : t("transfer.genericError"),
              }
            : current,
        );
      }
    },
    [t],
  );

  const close = () => {
    stopCreep();
    setState(null);
  };

  const node = (
    <Dialog
      open={state !== null}
      onOpenChange={(next) => {
        if (!next && state?.phase !== "running") close();
      }}
    >
      <DialogContent
        className="sm:max-w-md"
        onInteractOutside={(event) => {
          if (state?.phase === "running") event.preventDefault();
        }}
        onEscapeKeyDown={(event) => {
          if (state?.phase === "running") event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>{state?.title ?? ""}</DialogTitle>
          <DialogDescription className="sr-only">{t("transfer.progress")}</DialogDescription>
        </DialogHeader>
        {state ? <TransferBody state={state} /> : null}
        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={state?.phase === "running"}>
            {t("actions.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { run, node, busy: state?.phase === "running" };
}
