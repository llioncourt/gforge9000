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
import { listCampaigns, listCharacters, listLibrary } from "@/lib/api";
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
  const { data: characters = [] } = useQuery({
    queryKey: ["characters"],
    queryFn: listCharacters,
    enabled: open,
  });
  const { data: campaigns = [] } = useQuery({
    queryKey: ["campaigns"],
    queryFn: listCampaigns,
    enabled: open,
  });
  const { data: library = [] } = useQuery({
    queryKey: ["library"],
    queryFn: listLibrary,
    enabled: open,
  });

  const go = (fn: () => void) => {
    onOpenChange(false);
    fn();
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Jump to a character, campaign, or library entry…" />
      <CommandList>
        <CommandEmpty>Nothing matched.</CommandEmpty>
        <CommandGroup heading="Actions">
          <CommandItem onSelect={() => go(() => navigate({ to: "/characters" }))}>
            New character
          </CommandItem>
          <CommandItem onSelect={() => go(() => roll({ label: "Quick 3d6", target: 10 }))}>
            Roll 3d6 vs 10
          </CommandItem>
          <CommandItem onSelect={() => go(() => navigate({ to: "/campaigns" }))}>
            Campaigns
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Characters">
          {characters.slice(0, 8).map((c) => (
            <CommandItem
              key={c.id}
              value={`character ${c.name}`}
              onSelect={() =>
                go(() => navigate({ to: "/characters/$id", params: { id: c.id } }))
              }
            >
              {c.name}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Campaigns">
          {campaigns.slice(0, 8).map((c) => (
            <CommandItem
              key={c.id}
              value={`campaign ${c.name}`}
              onSelect={() => go(() => navigate({ to: "/campaigns/$id", params: { id: c.id } }))}
            >
              {c.name}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Library">
          {library.slice(0, 8).map((c) => (
            <CommandItem
              key={c.id}
              value={`library ${c.name}`}
              onSelect={() => go(() => navigate({ to: "/library" }))}
            >
              {c.name}
              <span className="ml-auto text-xs text-muted-foreground">{c.kind}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
