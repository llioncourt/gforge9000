import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Plus, Search, Sparkles, Upload } from "lucide-react";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { KINDS, kindDef } from "@/lib/entity-kinds";
import {
  createEntity,
  dataValue,
  listEntities,
  listRelationships,
  type EntityRow,
} from "@/lib/lore";
import { getCampaign, listCampaignCharacters } from "@/lib/api";
import { download } from "@/lib/portable";
import { parsePortableLore, toPortableLore } from "@/lib/lore-portable";
import { importLore } from "@/lib/lore-import";
import { ImportDialog, useTransferTask } from "@/components/ui/transfer-dialog";
import { AiDraftDialog } from "@/components/lore/ai-draft-dialog";
import { EntityDeleteButton } from "@/components/lore/entity-delete-button";
import { EntityThumb } from "@/components/lore/entity-thumb";
import { VisibilityBadge } from "@/components/lore/visibility-badge";

const GROUPS: { group: string; label: string }[] = [
  { group: "world", label: "World" },
  { group: "story", label: "Story" },
  { group: "play", label: "Play" },
  { group: "assets", label: "Assets" },
];

export function LorePanel({ campaignId, isGm }: { campaignId: string; isGm: boolean }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState("world");
  const [kindFilter, setKindFilter] = useState("ALL");
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [draftKind, setDraftKind] = useState("NPC");
  const [newKind, setNewKind] = useState("NPC");
  const [newName, setNewName] = useState("");

  const exportTask = useTransferTask();

  const runExportLore = () =>
    void exportTask.run("Exporting world & lore", async (report) => {
      report("Reading campaign…", 15);
      const [campaign, rows, rels] = await Promise.all([
        getCampaign(campaignId),
        listEntities(campaignId),
        listRelationships(campaignId),
      ]);
      report("Building file…", 60);
      const file = toPortableLore(campaign.name, rows, rels);
      const slug = campaign.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      report("Downloading…", 90);
      download(`${slug || "campaign"}-lore.json`, JSON.stringify(file, null, 2));
      return `Exported ${file.entities.length} entries.`;
    });

  const runImportLore = async (file: File, report: (label: string, percent?: number) => void) => {
    report("Reading file…", 10);
    const parsed = parsePortableLore(await file.text());
    report("Importing entries and links…", 45);
    const result = await importLore(campaignId, parsed);
    report("Refreshing world & lore…", 90);
    await queryClient.invalidateQueries({ queryKey: ["lore-entities", campaignId] });
    return `Imported ${result.entities} entries and ${result.relationships} links.`;
  };

  const entities = useQuery({
    queryKey: ["lore-entities", campaignId],
    queryFn: () => listEntities(campaignId),
  });

  const characters = useQuery({
    queryKey: ["campaign-characters", campaignId],
    queryFn: () => listCampaignCharacters(campaignId),
    staleTime: 1000 * 60 * 5,
  });

  /** Portrait of the character sheet a lore entry links to, used as image fallback. */
  const sheetPortrait = (row: EntityRow) => {
    const sheetId = dataValue(row, "character_sheet_id");
    if (!sheetId) return null;
    return (characters.data ?? []).find((c) => c.id === sheetId)?.portrait_path ?? null;
  };

  const kindsInGroup = useMemo(() => KINDS.filter((k) => k.group === group), [group]);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (entities.data ?? []).filter((row) => {
      const def = kindDef(row.kind);
      if (def.group !== group) return false;
      if (kindFilter !== "ALL" && row.kind !== kindFilter) return false;
      if (!term) return true;
      return (
        row.name.toLowerCase().includes(term) ||
        (row.summary ?? "").toLowerCase().includes(term) ||
        row.tags.some((tag) => tag.toLowerCase().includes(term))
      );
    });
  }, [entities.data, group, kindFilter, search]);

  const byKind = useMemo(() => {
    const map = new Map<string, EntityRow[]>();
    for (const row of rows) {
      const list = map.get(row.kind) ?? [];
      list.push(row);
      map.set(row.kind, list);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows]);

  const create = useMutation({
    mutationFn: () =>
      createEntity({
        campaign_id: campaignId,
        kind: newKind,
        name: newName.trim() || "Untitled",
        status: kindDef(newKind).defaultStatus,
      }),
    onSuccess: async () => {
      setCreating(false);
      setNewName("");
      toast.success("Entry created");
      await queryClient.invalidateQueries({ queryKey: ["lore-entities", campaignId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-wrap gap-2">
          {GROUPS.map((item) => (
            <Button
              key={item.group}
              variant={group === item.group ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setGroup(item.group);
                setKindFilter("ALL");
              }}
            >
              {item.label}
            </Button>
          ))}
        </div>
        <div className="ml-auto flex flex-wrap items-end gap-3">
          <div className="relative">
            <Search className="text-muted-foreground pointer-events-none absolute top-2.5 left-2 size-4" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search lore"
              className="w-56 pl-8"
            />
          </div>
          <Select value={kindFilter} onValueChange={setKindFilter}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All types</SelectItem>
              {kindsInGroup.map((k) => (
                <SelectItem key={k.kind} value={k.kind}>
                  {k.plural}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isGm ? (
            <>
              <Button variant="outline" onClick={runExportLore} disabled={exportTask.busy}>
                <Download className="mr-2 size-4" /> Export
              </Button>
              <Button variant="outline" onClick={() => setImporting(true)}>
                <Upload className="mr-2 size-4" /> Import
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setDraftKind(
                    kindFilter !== "ALL" ? kindFilter : (kindsInGroup[0]?.kind ?? "NPC"),
                  );
                  setDrafting(true);
                }}
              >
                <Sparkles className="mr-2 size-4" /> AI draft
              </Button>
              <Button
                onClick={() => {
                  setNewKind(kindFilter !== "ALL" ? kindFilter : (kindsInGroup[0]?.kind ?? "NPC"));
                  setCreating(true);
                }}
              >
                <Plus className="mr-2 size-4" /> New entry
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {entities.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-24 w-full" />
          ))}
        </div>
      ) : byKind.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Nothing here yet. {isGm ? "Create the first entry for this part of the campaign." : null}
        </p>
      ) : (
        byKind.map(([kind, list]) => (
          <section key={kind} className="space-y-3">
            <h3 className="text-sm font-semibold tracking-wide uppercase">
              {kindDef(kind).plural}
              <span className="text-muted-foreground ml-2 font-normal">{list.length}</span>
            </h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((row) => (
                <div key={row.id} className="relative h-full">
                  <Link
                    to="/entities/$id"
                    params={{ id: row.id }}
                    search={{ from: "lore" }}
                    className="hover:bg-accent/40 block h-full rounded-lg border p-3 transition"
                  >
                    <div className="flex h-full items-start gap-3">
                      <EntityThumb
                        path={row.image_url}
                        fallbackPath={sheetPortrait(row)}
                        name={row.name}
                      />
                      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-medium">{row.name}</span>
                          <VisibilityBadge visibility={row.visibility} isGm={isGm} />
                        </div>
                        <p className="text-muted-foreground mt-1 line-clamp-2 min-h-10 flex-1 text-sm">
                          {row.summary ?? row.player_description ?? "No summary yet."}
                        </p>
                        <p className="text-muted-foreground mt-2 text-xs">{row.status}</p>
                      </div>
                    </div>
                  </Link>
                  {isGm ? (
                    <div className="absolute right-2 bottom-2">
                      <EntityDeleteButton
                        campaignId={campaignId}
                        entityId={row.id}
                        name={row.name}
                      />
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        ))
      )}

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New lore entry</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="lore-kind">Type</Label>
              <Select value={newKind} onValueChange={setNewKind}>
                <SelectTrigger id="lore-kind">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KINDS.map((k) => (
                    <SelectItem key={k.kind} value={k.kind}>
                      {k.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="lore-name">Name</Label>
              <Input
                id="lore-name"
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                placeholder="Name"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button onClick={() => create.mutate()} disabled={create.isPending}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ImportDialog
        open={importing}
        onOpenChange={setImporting}
        title="Import lore"
        description="Adds the entries and their links from an exported file to this campaign. Existing entries are kept; nothing is overwritten."
        accept="application/json,.json"
        label="Drop a lore export here, or click to browse"
        hint="JSON file exported from a campaign"
        run={runImportLore}
      />
      {exportTask.node}

      {isGm ? (
        <AiDraftDialog
          key={draftKind}
          campaignId={campaignId}
          open={drafting}
          onOpenChange={setDrafting}
          initialKind={draftKind}
        />
      ) : null}
    </div>
  );
}
