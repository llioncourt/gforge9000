import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Boxes, Download, Plus } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FileDropzone } from "@/components/ui/FileDropzone";
import {
  createContentPack,
  importLibraryEntries,
  listCampaigns,
  listContentPacks,
  listLibrary,
} from "@/lib/api";
import { parsePortablePack } from "@/lib/portable";
import {
  campaignsEnablingPack,
  groupEntriesByPack,
  makeGroup,
  UNPACKED_LABEL,
  type PackGroup,
} from "@/lib/packs";
import { useSession } from "@/hooks/use-session";
import { packSlug } from "@/lib/pack-slug";

export const Route = createFileRoute("/_authenticated/packs/")({
  head: () => ({
    meta: [
      { title: "Content packs — Universal Character Forge" },
      {
        name: "description",
        content:
          "Curate, import and share content packs of traits, skills and gear, and enable them per campaign.",
      },
      { property: "og:title", content: "Content packs — Universal Character Forge" },
      {
        property: "og:description",
        content: "Group your library into packs and enable them for the campaigns you run.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PacksPage,
});

function PacksPage() {
  const queryClient = useQueryClient();
  const { user } = useSession();
  const library = useQuery({ queryKey: ["library"], queryFn: listLibrary });
  const packsQuery = useQuery({ queryKey: ["content-packs"], queryFn: listContentPacks });
  const campaigns = useQuery({ queryKey: ["campaigns"], queryFn: listCampaigns });
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const gmCampaigns = useMemo(
    () => (campaigns.data ?? []).filter((c) => c.gm_id === user?.id),
    [campaigns.data, user?.id],
  );

  const groups = useMemo(() => {
    const grouped = groupEntriesByPack(library.data ?? []);
    const named = new Set(grouped.map((g) => g.pack).filter(Boolean) as string[]);
    const empty: PackGroup[] = (packsQuery.data ?? [])
      .filter((p) => !named.has(p.name))
      .map((p) => makeGroup(p.name, []));
    return [...grouped.filter((g) => g.pack !== null), ...empty]
      .sort((a, b) => a.label.localeCompare(b.label))
      .concat(grouped.filter((g) => g.pack === null));
  }, [library.data, packsQuery.data]);

  const filtered = groups.filter((g) =>
    `${g.label} ${g.sources.join(" ")}`.toLowerCase().includes(search.toLowerCase()),
  );

  const create = useMutation({
    mutationFn: () => createContentPack({ name: name.trim(), description: description || null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["content-packs"] });
      toast.success("Pack created.");
      setOpen(false);
      setName("");
      setDescription("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const importPack = useMutation({
    mutationFn: async (file: File) => {
      const parsed = parsePortablePack(await file.text());
      await createContentPack({
        name: parsed.pack.name,
        description: parsed.pack.description,
        source_label: parsed.pack.source_label,
        source_edition: parsed.pack.source_edition,
        source_type: parsed.pack.source_type,
      }).catch(() => undefined);
      const rows = await importLibraryEntries(parsed.entries as never);
      return { pack: parsed.pack.name, count: rows.length };
    },
    onSuccess: ({ pack, count }) => {
      queryClient.invalidateQueries({ queryKey: ["library"] });
      queryClient.invalidateQueries({ queryKey: ["content-packs"] });
      toast.success(`Imported ${count} entries into “${pack}”.`);
    },
    onError: (e: Error) => toast.error(`Import failed: ${e.message}`),
  });

  return (
    <div>
      <PageHeader
        title="Packs"
        description="Content packs group your library into reusable sets you can curate, share and enable per campaign."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> New pack
          </Button>
        }
      />

      <div className="panel mb-4 p-4 text-sm text-muted-foreground">
        <p>
          This app ships no published rulebook content: there is no SRD for GURPS and nothing
          proprietary is preloaded. You can bring content in by writing your own packs, importing
          pack JSON you are allowed to use, installing licensed packs when they become available, or
          using adapters for data you are authorised to export from other tools. Never paste text,
          tables or artwork you do not have the right to reproduce.
        </p>
      </div>

      <div className="mb-4 grid gap-3 lg:grid-cols-[1fr_320px]">
        <Input
          className="max-w-xs"
          placeholder="Search packs…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <FileDropzone
          accept="application/json"
          compact
          label="Import a pack"
          hint="Drop a Universal Character Forge pack JSON file"
          onFiles={(files) => {
            const file = files[0];
            if (file) importPack.mutate(file);
          }}
        />
      </div>

      {library.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[190px] w-full rounded-lg" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="panel p-10 text-center text-sm text-muted-foreground">
          No packs yet. Create one, or import a pack JSON file.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((g) => {
            const meta = (packsQuery.data ?? []).find((p) => p.name === g.pack);
            const enabledIn = campaignsEnablingPack(g.pack, gmCampaigns);
            return (
              <Link
                key={g.label}
                to="/packs/$pack"
                params={{ pack: packSlug(g.pack) }}
                className="panel flex flex-col p-4 transition-colors hover:border-ring"
              >
                <div className="flex items-start gap-2">
                  <Boxes className="mt-0.5 h-4 w-4 text-primary" />
                  <div className="min-w-0">
                    <p className="truncate font-medium">{g.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {g.total} entr{g.total === 1 ? "y" : "ies"}
                      {g.pack === null ? " · not in any pack" : ""}
                    </p>
                  </div>
                </div>
                {meta?.description ? (
                  <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                    {meta.description}
                  </p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-1">
                  {g.kinds.slice(0, 6).map((k) => (
                    <Badge key={k.kind} variant="outline" className="text-[10px]">
                      {k.kind} {k.count}
                    </Badge>
                  ))}
                </div>
                <p className="mt-3 text-[11px] text-muted-foreground">
                  {g.sources.length ? g.sources.join(" · ") : meta?.source_label ?? "User content"}
                  {g.visibilities.length ? ` · ${g.visibilities.join(", ")}` : ""}
                </p>
                <p className="mt-auto pt-3 text-[11px] text-muted-foreground">
                  {g.pack === null
                    ? "Personal content is always available to you."
                    : enabledIn.length
                      ? `Enabled in ${enabledIn.map((c) => c.name).join(", ")}`
                      : "Not enabled in any campaign you run"}
                </p>
              </Link>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New content pack</DialogTitle>
            <DialogDescription>
              A pack groups your own library entries. {UNPACKED_LABEL} stays available either way.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="pack-name">Name</Label>
              <Input id="pack-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pack-desc">Description</Label>
              <Textarea
                id="pack-desc"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => create.mutate()} disabled={!name.trim() || create.isPending}>
              <Download className="mr-2 hidden h-4 w-4" />
              Create pack
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
