import { useCallback, useRef, useState, type ReactNode } from "react";
import { useT } from "@/i18n/hooks";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FileDropzone } from "@/components/ui/FileDropzone";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type TransferReport = (label: string, percent?: number) => void;

type Phase = "running" | "done" | "error";

interface TransferState {
  title: string;
  label: string;
  percent: number;
  phase: Phase;
  message: string | null;
}

function TransferBody({ state }: { state: TransferState }) {
  return (
    <div className="space-y-3">
      <Progress value={state.phase === "error" ? 100 : state.percent} />
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className={state.phase === "error" ? "text-destructive" : "text-muted-foreground"}>
          {state.phase === "running" ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> {state.label}
            </span>
          ) : (
            (state.message ?? state.label)
          )}
        </span>
        {state.phase === "error" ? null : (
          <span className="tabular-nums text-muted-foreground">{Math.round(state.percent)}%</span>
        )}
      </div>
    </div>
  );
}

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

/**
 * Dedicated import modal: pick a file inside the dialog, then watch a real
 * progress bar for the import itself.
 */
export function ImportDialog({
  open,
  onOpenChange,
  title,
  description,
  accept,
  label,
  hint,
  extra,
  run,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  accept: string;
  label: string;
  hint?: string;
  extra?: ReactNode;
  run: (file: File, report: TransferReport) => Promise<string>;
}) {
  const { t } = useT();
  const [state, setState] = useState<TransferState | null>(null);
  const creep = useRef<number | null>(null);

  const stopCreep = () => {
    if (creep.current !== null) {
      window.clearInterval(creep.current);
      creep.current = null;
    }
  };

  const start = async (file: File) => {
    setState({
      title,
      label: t("transfer.readingFile"),
      percent: 0,
      phase: "running",
      message: null,
    });
    stopCreep();
    creep.current = window.setInterval(() => {
      setState((current) =>
        current && current.phase === "running" && current.percent < 90
          ? { ...current, percent: current.percent + Math.max(0.5, (90 - current.percent) / 25) }
          : current,
      );
    }, 220);
    try {
      const message = await run(file, (stepLabel, percent) =>
        setState((current) =>
          current
            ? {
                ...current,
                label: stepLabel,
                percent: percent === undefined ? current.percent : percent,
              }
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
              message: error instanceof Error ? error.message : t("transfer.importFailed"),
            }
          : current,
      );
    }
  };

  const close = () => {
    stopCreep();
    setState(null);
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && state?.phase === "running") return;
        if (!next) close();
        else onOpenChange(true);
      }}
    >
      <DialogContent
        className="sm:max-w-lg"
        onInteractOutside={(event) => {
          if (state?.phase === "running") event.preventDefault();
        }}
        onEscapeKeyDown={(event) => {
          if (state?.phase === "running") event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        {state ? (
          <TransferBody state={state} />
        ) : (
          <div className="space-y-3">
            <FileDropzone
              accept={accept}
              label={label}
              {...(hint ? { hint } : {})}
              onFiles={(files) => {
                const file = files[0];
                if (file) void start(file);
              }}
            />
            {extra}
          </div>
        )}
        <DialogFooter>
          {state && state.phase !== "running" ? (
            <Button variant="outline" onClick={() => setState(null)}>
              {t("transfer.importAnother")}
            </Button>
          ) : null}
          <Button variant="outline" onClick={close} disabled={state?.phase === "running"}>
            {t("actions.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
