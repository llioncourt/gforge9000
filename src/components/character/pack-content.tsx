import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Info, Package, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { listContentPacks, listLibrary, type LibraryListRow } from "@/lib/api";
import { rankSearch } from "@/lib/search";
import { useT } from "@/i18n/hooks";

/** Pack names that exist for this user: declared packs plus packs seen on entries. */
export function useAvailablePacks() {
  const packs = useQuery({ queryKey: ["packs"], queryFn: listContentPacks });
  const library = useQuery({ queryKey: ["library"], queryFn: listLibrary });
  return useMemo(() => {
    const names = new Set<string>();
    for (const p of packs.data ?? []) names.add(p.name);
    for (const e of library.data ?? []) if (e.pack) names.add(e.pack);
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [packs.data, library.data]);
}

/** Lets the player link the character to the packs its content may come from. */
export function CharacterPacksPanel({
  packs,
  lockedPacks = [],
  onChange,
}: {
  packs: string[];
  /** Packs forced on by the character's campaign; they cannot be unlinked here. */
  lockedPacks?: string[];
  onChange: (next: string[]) => void;
}) {
  const { t } = useT("characters");
  const available = useAvailablePacks();
  const lockedSet = new Set(lockedPacks.map((p) => p.toLowerCase()));
  const names = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const name of [...lockedPacks, ...available]) {
      const key = name.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        out.push(name);
      }
    }
    return out;
  }, [lockedPacks, available]);
  const toggle = (name: string) =>
    onChange(packs.includes(name) ? packs.filter((p) => p !== name) : [...packs, name]);

  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <div className="flex items-center gap-2">
        <Package className="h-4 w-4 text-muted-foreground" />
        <Label>{t("sheet.pack.title")}</Label>
      </div>
      <p className="text-xs text-muted-foreground">{t("sheet.pack.description")}</p>
      {lockedPacks.length > 0 && (
        <p className="text-xs text-muted-foreground">{t("sheet.pack.campaignLockedHint")}</p>
      )}
      {names.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("sheet.pack.noneAvailable")}</p>
      ) : (
        <div className="flex flex-wrap gap-2 pt-1">
          {names.map((name) => {
            const locked = lockedSet.has(name.toLowerCase());
            const active = locked || packs.includes(name);
            return (
              <button
                key={name}
                type="button"
                onClick={() => !locked && toggle(name)}
                disabled={locked}
                aria-pressed={active}
                title={locked ? t("sheet.pack.campaignLockedTitle") : undefined}
                className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                  active
                    ? "border-primary bg-primary/15 text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground"
                } ${locked ? "cursor-not-allowed opacity-90" : ""}`}
              >
                {locked ? t("sheet.pack.campaignSuffix", { name }) : name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Browses entries from the character's linked packs and adds them to the sheet. */
export function PackPickerDialog({
  open,
  onOpenChange,
  kinds,
  packs,
  onAdd,
  pending,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  kinds: string[];
  /** `null` means every pack the user can see is offered. */
  packs: string[] | null;
  onAdd: (entry: LibraryListRow) => void;
  pending?: boolean;
}) {
  const { t } = useT("characters");
  const { t: tc } = useT("common");
  const library = useQuery({ queryKey: ["library"], queryFn: listLibrary, enabled: open });
  const [search, setSearch] = useState("");
  const [descFor, setDescFor] = useState<LibraryListRow | null>(null);

  const rows = useMemo(() => {
    const linked = packs?.map((p) => p.toLowerCase()) ?? null;
    const base = (library.data ?? []).filter(
      (e) =>
        kinds.includes(e.kind) &&
        !!e.pack &&
        (linked === null || linked.includes(e.pack.toLowerCase())),
    );
    return rankSearch(search, base, (e) => ({
      name: e.name,
      fields: [e.category, e.summary, e.pack, ...(e.tags ?? [])],
    }));
  }, [library.data, kinds, packs, search]);


  const descParts = (e: LibraryListRow) =>
    [
      e.category,
      e.source_label,
      e.source_page ? `p. ${e.source_page}` : null,
      ...(e.tags ?? []),
    ].filter(Boolean) as string[];

  const hasDesc = (e: LibraryListRow) =>
    !!(e.summary || e.category || e.source_label || e.source_page || (e.tags && e.tags.length));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-hidden">
        <DialogHeader>
          <DialogTitle>{t("sheet.pack.pickerTitle")}</DialogTitle>
          <DialogDescription>
            {packs === null
              ? t("sheet.pack.showingAllKinds", { kinds: kinds.join(", ") })
              : packs.length === 0
                ? t("sheet.pack.noPacksLinked")
                : t("sheet.pack.showingKinds", {
                    kinds: kinds.join(", "),
                    packs: packs.join(", "),
                  })}
          </DialogDescription>

        </DialogHeader>

        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder={t("sheet.pack.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="max-h-[50vh] space-y-1 overflow-y-auto pr-1">
          {rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t("sheet.pack.nothingAvailable")}
            </p>
          ) : (
            rows.map((e) => (
              <div
                key={e.id}
                className="flex items-center gap-2 rounded-md border border-border px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium" title={e.name}>
                    {e.name}
                  </p>
                </div>
                {hasDesc(e) && (
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => setDescFor(e)}
                    aria-label={t("sheet.pack.descriptionAria", { name: e.name })}
                  >
                    <Info className="h-4 w-4" />
                  </button>
                )}
                <Badge variant="outline">{e.pack}</Badge>
                <Button size="sm" disabled={pending} onClick={() => onAdd(e)}>
                  {tc("actions.add")}
                </Button>
              </div>
            ))
          )}
        </div>
      </DialogContent>

      <Dialog open={!!descFor} onOpenChange={(v) => !v && setDescFor(null)}>
        <DialogContent className="max-h-[80vh] max-w-lg overflow-y-auto">
          {descFor && (
            <>
              <DialogHeader>
                <DialogTitle>{descFor.name}</DialogTitle>
                {descParts(descFor).length > 0 && (
                  <DialogDescription>{descParts(descFor).join(" · ")}</DialogDescription>
                )}
              </DialogHeader>
              {descFor.summary && (
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {descFor.summary}
                </p>
              )}
              {!descFor.summary && (
                <p className="text-sm text-muted-foreground">{t("sheet.pack.noDetails")}</p>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}

/** True when an entry was typed by hand rather than pulled from a pack. */
export function isCustomEntry(source: unknown): boolean {
  const s = (source ?? {}) as Record<string, unknown>;
  return !s["pack"];
}
