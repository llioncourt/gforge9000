import { useState } from "react";
import { useLocation } from "@tanstack/react-router";
import { Dices } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useDice } from "@/components/app/dice-context";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/hooks";

export function outcomeTone(outcome: string | null) {
  switch (outcome) {
    case "critical success":
      return "text-success";
    case "success":
      return "text-foreground";
    case "critical failure":
      return "text-destructive";
    case "failure":
      return "text-destructive/80";
    default:
      return "text-muted-foreground";
  }
}

export function DiceTray({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { t } = useT("dice");
  const { history, roll, clear } = useDice();
  const [expression, setExpression] = useState("3d6");
  const [target, setTarget] = useState("12");
  const [label, setLabel] = useState(t("tray.defaultLabel"));
  const { pathname } = useLocation();
  const campaignMatch = /^\/campaigns\/([0-9a-f-]{36})/i.exec(pathname);
  const campaignId = campaignMatch?.[1] ?? null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Dices className="h-4 w-4" /> {t("tray.title")}
          </SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="dice-expr">{t("tray.expression")}</Label>
              <Input id="dice-expr" value={expression} onChange={(e) => setExpression(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dice-target">{t("tray.target")}</Label>
              <Input id="dice-target" value={target} onChange={(e) => setTarget(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dice-label">{t("tray.label")}</Label>
            <Input id="dice-label" value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <Button
              className="flex-1"
              onClick={() =>
                roll({
                  label: label || t("tray.roll"),
                  expression,
                  target: target.trim() === "" ? null : Number(target),
                  campaignId,
                })
              }
            >
              {t("tray.roll")}
            </Button>
            <Button
              variant="outline"
              onClick={() => roll({ label: t("tray.reaction"), expression: "3d6", campaignId })}
            >
              3d6
            </Button>
            <Button
              variant="outline"
              onClick={() => roll({ label: t("tray.damage"), expression: "2d6+1", campaignId })}
            >
              2d6+1
            </Button>
          </div>
          {campaignId ? (
            <p className="text-xs text-muted-foreground">{t("tray.recordedNotice")}</p>
          ) : null}

          <div className="flex items-center justify-between pt-2">
            <p className="text-sm font-medium">{t("tray.history")}</p>
            <Button variant="ghost" size="sm" onClick={clear}>
              {t("tray.clear")}
            </Button>
          </div>
          <div className="max-h-[45vh] space-y-2 overflow-y-auto pr-1">
            {history.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("tray.noRolls")}</p>
            ) : (
              history.map((h) => (
                <div key={h.id} className="panel flex items-center gap-3 p-3 text-sm">
                  <span className="stat-value text-lg">{h.total}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{h.label}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {h.expression} · {h.dice.join(" + ")}
                      {h.target !== null ? ` · ${t("tray.vsTarget", { target: h.target })}` : ""}
                    </p>
                  </div>
                  {h.outcome ? (
                    <Badge variant="outline" className={cn("shrink-0", outcomeTone(h.outcome))}>
                      {t(`outcome.${h.outcome}`)}
                    </Badge>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
