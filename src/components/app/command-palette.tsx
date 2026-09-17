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
import { globalSearch, type CampaignTab, type MediaSubTab, type SearchHit, type SearchTarget } from "@/lib/global-search";
import { useDice } from "@/components/app/dice-context";
import { useT } from "@/i18n/hooks";

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const navigate = useNavigate();
  const { roll } = useDice();
  const { t } = useT("navigation");
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
      const list = map.get(hit.groupKey) ?? [];
      list.push(hit);
      map.set(hit.groupKey, list);
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
        const search: { tab?: CampaignTab; item?: string; sub?: MediaSubTab } = {};
        if (target.tab) search.tab = target.tab;
        if (target.item) search.item = target.item;
        if (target.sub) search.sub = target.sub;
        void navigate({ to: "/campaigns/$id", params: { id: target.id }, search });
      } else if (target.kind === "library") {
        void navigate({ to: "/library", search: target.item ? { item: target.item } : {} });
      } else {
        void navigate({ to: "/packs" });
      }
    });

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        value={term}
        onValueChange={setTerm}
        placeholder={t("header.search")}
      />
      <CommandList>
        <CommandEmpty>
          {debounced.trim().length < 2
            ? t("commandPalette.typeToSearch")
            : isFetching
              ? t("commandPalette.searching")
              : t("commandPalette.noResults")}
        </CommandEmpty>
        <CommandGroup heading={t("commandPalette.actions")}>
          <CommandItem value="action new character" onSelect={() => go(() => navigate({ to: "/characters" }))}>
            {t("commandPalette.newCharacter")}
          </CommandItem>
          <CommandItem
            value="action roll 3d6"
            onSelect={() => go(() => roll({ label: "Quick 3d6", target: 10 }))}
          >
            {t("commandPalette.rollQuickDice")}
          </CommandItem>
          <CommandItem value="action campaigns" onSelect={() => go(() => navigate({ to: "/campaigns" }))}>
            {t("commandPalette.campaigns")}
          </CommandItem>
        </CommandGroup>
        {groups.length ? <CommandSeparator /> : null}
        {groups.map(([groupKey, items]) => (
          <CommandGroup key={groupKey} heading={tk(groupKey)}>
            {items.map((hit) => (
              <CommandItem key={hit.id} value={`${hit.id} ${hit.label}`} onSelect={() => openTarget(hit.target)}>
                {hit.labelKey ? tk(hit.labelKey) : hit.label}
                {hit.sublabelKey ? (
                  <span className="ml-auto text-xs text-muted-foreground">
                    {tk(hit.sublabelKey, hit.sublabelParams)}
                  </span>
                ) : hit.sublabel ? (
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
