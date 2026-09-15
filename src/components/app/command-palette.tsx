import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { globalSearch, type SearchHit, type SearchTarget } from "@/lib/global-search";
import { useDice } from "@/components/app/dice-context";

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const navigate = useNavigate();
  const { roll } = useDice();
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(term), 180);
    return () => clearTimeout(timer);
  }, [term]);

  useEffect(() => {
    if (!open) {
      setTerm("");
      setDebounced("");
    }
  }, [open]);

  const { data: hits = [], isFetching } = useQuery({
    queryKey: ["global-search", debounced],
    queryFn: () => globalSearch(debounced),
    enabled: open && debounced.trim().length >= 2,
    staleTime: 30_000,
  });

  const groups = useMemo(() => {
    const map = new Map<string, SearchHit[]>();
    for (const hit of hits) {
      const list = map.get(hit.group) ?? [];
      list.push(hit);
      map.set(hit.group, list);
    }
    return [...map.entries()];
  }, [hits]);

  const go = (fn: () => void) => {
    onOpenChange(false);
    fn();
  };

  const openTarget = (target: SearchTarget) =>
    go(() => {
      if (target.kind === "character") {
        void navigate({ to: "/characters/$id", params: { id: target.id } });
      } else if (target.kind === "entity") {
        void navigate({ to: "/entities/$id", params: { id: target.id }, search: { from: target.from } });
      } else if (target.kind === "campaign") {
        void navigate({
          to: "/campaigns/$id",
          params: { id: target.id },
          ...(target.tab ? { search: { tab: target.tab } } : {}),
        });
      } else if (target.kind === "library") {
        void navigate({ to: "/library" });
      } else {
        void navigate({ to: "/packs" });
      }
    });

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        value={term}
        onValueChange={setTerm}
        placeholder="Search characters, campaigns, lore, media, notes, maps…"
      />
      <CommandList>
        <CommandEmpty>
          {debounced.trim().length < 2
            ? "Type at least two letters to search."
            : isFetching
              ? "Searching…"
              : "Nothing matched."}
        </CommandEmpty>
        <CommandGroup heading="Actions">
          <CommandItem value="action new character" onSelect={() => go(() => navigate({ to: "/characters" }))}>
            New character
          </CommandItem>
          <CommandItem
            value="action roll 3d6"
            onSelect={() => go(() => roll({ label: "Quick 3d6", target: 10 }))}
          >
            Roll 3d6 vs 10
          </CommandItem>
          <CommandItem value="action campaigns" onSelect={() => go(() => navigate({ to: "/campaigns" }))}>
            Campaigns
          </CommandItem>
        </CommandGroup>
        {groups.length ? <CommandSeparator /> : null}
        {groups.map(([group, items]) => (
          <CommandGroup key={group} heading={group}>
            {items.map((hit) => (
              <CommandItem key={hit.id} value={`${hit.id} ${hit.label}`} onSelect={() => openTarget(hit.target)}>
                {hit.label}
                {hit.sublabel ? (
                  <span className="ml-auto text-xs text-muted-foreground">{hit.sublabel}</span>
                ) : null}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
