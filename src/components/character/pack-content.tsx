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
import { listContentPacks, listLibrary, type LibraryRow } from "@/lib/api";
import { rankSearch } from "@/lib/search";


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
        <Label>Content packs</Label>
      </div>
      <p className="text-xs text-muted-foreground">
        Traits, skills and gear are picked from the packs linked here. Anything typed by hand is
        marked as custom.
      </p>
      {lockedPacks.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Packs enabled by the campaign are always available and cannot be removed here.
        </p>
      )}
      {names.length === 0 ? (
        <p className="text-xs text-muted-foreground">No packs available yet.</p>
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
                title={locked ? "Enabled by the campaign" : undefined}
                className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                  active
                    ? "border-primary bg-primary/15 text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground"
                } ${locked ? "cursor-not-allowed opacity-90" : ""}`}
              >
                {name}
                {locked ? " (campaign)" : ""}
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
  packs: string[];
  onAdd: (entry: LibraryRow) => void;
  pending?: boolean;
}) {
  const library = useQuery({ queryKey: ["library"], queryFn: listLibrary, enabled: open });
  const [search, setSearch] = useState("");
  const [descFor, setDescFor] = useState<LibraryRow | null>(null);

  const rows = useMemo(() => {
    const linked = packs.map((p) => p.toLowerCase());
    return (library.data ?? []).filter(
      (e) =>
        kinds.includes(e.kind) &&
        !!e.pack &&
        linked.includes(e.pack.toLowerCase()) &&
        matchesSearch(search, [e.name, e.category, e.summary, e.pack, ...(e.tags ?? [])]),
    );
  }, [library.data, kinds, packs, search]);


  const descParts = (e: LibraryRow) =>
    [e.category, e.source_label, e.source_page ? `p. ${e.source_page}` : null, ...(e.tags ?? [])]
      .filter(Boolean) as string[];

  const hasDesc = (e: LibraryRow) =>
    !!(e.summary || e.category || e.source_label || e.source_page || (e.tags && e.tags.length));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-hidden">
        <DialogHeader>
          <DialogTitle>Add from packs</DialogTitle>
          <DialogDescription>
            {packs.length === 0
              ? "This character is not linked to any pack yet. Link one on the Attributes tab."
              : `Showing ${kinds.join(", ")} from: ${packs.join(", ")}.`}
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="max-h-[50vh] space-y-1 overflow-y-auto pr-1">
          {rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nothing available here.
            </p>
          ) : (
            rows.map((e) => (
              <div
                key={e.id}
                className="flex items-center gap-2 rounded-md border border-border px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium" title={e.name}>{e.name}</p>
                </div>
                {hasDesc(e) && (
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => setDescFor(e)}
                    aria-label={`Description for ${e.name}`}
                  >
                    <Info className="h-4 w-4" />
                  </button>
                )}
                <Badge variant="outline">{e.pack}</Badge>
                <Button size="sm" disabled={pending} onClick={() => onAdd(e)}>
                  Add
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
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{descFor.summary}</p>
              )}
              {!descFor.summary && (
                <p className="text-sm text-muted-foreground">No further details.</p>
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
