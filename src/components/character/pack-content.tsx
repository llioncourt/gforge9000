import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Package, Search } from "lucide-react";
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
  onChange,
}: {
  packs: string[];
  onChange: (next: string[]) => void;
}) {
  const available = useAvailablePacks();
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
      {available.length === 0 ? (
        <p className="text-xs text-muted-foreground">No packs available yet.</p>
      ) : (
        <div className="flex flex-wrap gap-2 pt-1">
          {available.map((name) => {
            const active = packs.includes(name);
            return (
              <button
                key={name}
                type="button"
                onClick={() => toggle(name)}
                aria-pressed={active}
                className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                  active
                    ? "border-primary bg-primary/15 text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {name}
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

  const rows = useMemo(() => {
    const linked = packs.map((p) => p.toLowerCase());
    return (library.data ?? []).filter(
      (e) =>
        kinds.includes(e.kind) &&
        !!e.pack &&
        linked.includes(e.pack.toLowerCase()) &&
        `${e.name} ${e.category ?? ""}`.toLowerCase().includes(search.toLowerCase()),
    );
  }, [library.data, kinds, packs, search]);

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
            rows.map((e) => {
              const desc = [e.category, e.summary].filter(Boolean).join(" · ") || "—";
              return (
                <div
                  key={e.id}
                  className="flex items-center gap-3 rounded-md border border-border px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm font-medium" title={e.name}>{e.name}</p>
                    <p className="line-clamp-2 text-xs text-muted-foreground" title={desc}>
                      {desc}
                    </p>
                  </div>
                  <Badge variant="outline">{e.pack}</Badge>
                  <Button size="sm" disabled={pending} onClick={() => onAdd(e)}>
                    Add
                  </Button>
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** True when an entry was typed by hand rather than pulled from a pack. */
export function isCustomEntry(source: unknown): boolean {
  const s = (source ?? {}) as Record<string, unknown>;
  return !s["pack"];
}
