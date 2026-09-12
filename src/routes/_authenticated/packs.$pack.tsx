import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Download, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  createContentPack,
  deleteContentPack,
  listCampaigns,
  listContentPacks,
  listLibrary,
  renameContentPack,
  setLibraryEntryPack,
  updateCampaign,
  type LibraryRow,
} from "@/lib/api";
import { download, toPortablePack } from "@/lib/portable";
import {
  allowedPacksOf,
  groupEntriesByKind,
  makeGroup,
  togglePackInList,
  UNPACKED_LABEL,
} from "@/lib/packs";
import { packFromSlug, packSlug } from "@/lib/pack-slug";
import { slugify } from "@/lib/portable";
import { useSession } from "@/hooks/use-session";

export const Route = createFileRoute("/_authenticated/packs/$pack")({
  head: () => ({
    meta: [
      { title: "Pack detail — Universal Character Forge" },
      {
        name: "description",
        content: "Every entry in this content pack, grouped by kind, with provenance and campaign use.",
      },
      { property: "og:title", content: "Pack detail — Universal Character Forge" },
      { property: "og:description", content: "Curate a content pack and enable it per campaign." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PackDetailPage,
});

function PackDetailPage() {
  const { pack: slug } = Route.useParams();
  const packName = packFromSlug(slug);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { user } = useSession();

  const library = useQuery({ queryKey: ["library"], queryFn: listLibrary });
  const packsQuery = useQuery({ queryKey: ["content-packs"], queryFn: listContentPacks });
  const campaigns = useQuery({ queryKey: ["campaigns"], queryFn: listCampaigns });

  const [renameOpen, setRenameOpen] = useState(false);
  const [nextName, setNextName] = useState(packName ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [addId, setAddId] = useState("");

  const rows = useMemo(
    () => (library.data ?? []).filter((e) => (e.pack ?? null) === packName),
    [library.data, packName],
  );
  const group = makeGroup(packName, rows);
  const meta = (packsQuery.data ?? []).find((p) => p.name === packName);
  const mine = packName === null || !meta || meta.owner_id === user?.id;
  const gmCampaigns = (campaigns.data ?? []).filter((c) => c.gm_id === user?.id);

  const unpacked = useMemo(
    () =>
      (library.data ?? []).filter(
        (e) => (e.pack ?? null) !== packName && e.owner_id === user?.id,
      ),
    [library.data, packName, user?.id],
  );

  const rename = useMutation({
    mutationFn: async () => {
      if (!packName) throw new Error("Personal content cannot be renamed.");
      const target = nextName.trim();
      if (!target) throw new Error("Give the pack a name.");
      if (meta) await renameContentPack(meta.id, packName, target);
      else {
        const created = await createContentPack({ name: target });
        await renameContentPack(created.id, packName, target);
      }
      return target;
    },
    onSuccess: (target) => {
      queryClient.invalidateQueries();
      setRenameOpen(false);
      toast.success("Pack renamed.");
      navigate({ to: "/packs/$pack", params: { pack: packSlug(target) }, replace: true });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async () => {
      if (!packName) throw new Error("Personal content cannot be deleted.");
      if (meta) await deleteContentPack(meta.id, packName);
      else {
        for (const row of rows) await setLibraryEntryPack(row.id, null);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries();
      toast.success("Pack removed. Its entries are kept as personal content.");
      navigate({ to: "/packs" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const moveEntry = useMutation({
    mutationFn: ({ id, to }: { id: string; to: string | null }) => setLibraryEntryPack(id, to),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["library"] });
      setAddId("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const allPackNames = useMemo(() => {
    const names = new Set<string>();
    for (const e of library.data ?? []) {
      const n = (e.pack ?? "").trim();
      if (n) names.add(n);
    }
    for (const p of packsQuery.data ?? []) names.add(p.name);
    return [...names];
  }, [library.data, packsQuery.data]);

  const toggleCampaign = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const campaign = gmCampaigns.find((c) => c.id === id);
      if (!campaign || !packName) return;
      const settings = (campaign.settings ?? {}) as Record<string, unknown>;
      const current = allowedPacksOf(settings);
      // An empty list means "everything allowed"; switching one pack off has to
      // turn that into an explicit list of the remaining packs.
      const base =
        !enabled && current.length === 0
          ? allPackNames.filter((n) => n.toLowerCase() !== packName.toLowerCase())
          : current;
      const next = togglePackInList(base, packName, enabled);
      await updateCampaign(id, { settings: { ...settings, allowed_packs: next } as never });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["campaigns"] }),
    onError: (e: Error) => toast.error(e.message),
  });


  if (library.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-40 w-full rounded-lg" />
      </div>
    );
  }

  return (
    <div>
      <Link
        to="/packs"
        className="no-print mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> All packs
      </Link>
      <PageHeader
        title={group.label}
        description={
          packName === null
            ? "Entries that belong to no pack. They stay available to you and are never gated by campaign pack rules."
            : (meta?.description ?? "Content pack")
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() =>
                download(
                  `${slugify(group.label)}-pack.json`,
                  JSON.stringify(
                    toPortablePack(
                      {
                        name: packName ?? UNPACKED_LABEL,
                        description: meta?.description ?? null,
                        source_label: meta?.source_label ?? "User content",
                        source_edition: meta?.source_edition ?? null,
                        source_type: meta?.source_type ?? "user",
                        visibility: meta?.visibility ?? "private",
                      },
                      rows as unknown as Record<string, unknown>[],
                    ),
                    null,
                    2,
                  ),
                )
              }
            >
              <Download className="mr-2 h-4 w-4" /> Export pack
            </Button>
            {packName && mine ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    setNextName(packName);
                    setRenameOpen(true);
                  }}
                >
                  <Pencil className="mr-2 h-4 w-4" /> Rename
                </Button>
                <Button variant="outline" onClick={() => setConfirmDelete(true)}>
                  <Trash2 className="mr-2 h-4 w-4" /> Delete pack
                </Button>
              </>
            ) : null}
          </div>
        }
      />

      <div className="mb-6 grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="panel p-4">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Provenance</p>
          <p className="mt-2 text-sm">
            {group.sources.length ? group.sources.join(" · ") : (meta?.source_label ?? "User content")}
            {meta?.source_edition ? ` · ${meta.source_edition}` : ""} ·{" "}
            {meta?.source_type ?? "user"} content
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {group.total} entr{group.total === 1 ? "y" : "ies"} ·{" "}
            {group.kinds.map((k) => `${k.count} ${k.kind}`).join(", ") || "no entries yet"} ·
            visibility {group.visibilities.join(", ") || (meta?.visibility ?? "private")}
          </p>
        </div>

        <div className="panel p-4">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            Enabled in campaigns you run
          </p>
          {packName === null ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Personal content is never restricted by campaign pack rules.
            </p>
          ) : gmCampaigns.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">You do not run any campaign yet.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {gmCampaigns.map((c) => {
                const allowed = allowedPacksOf(c.settings);
                const on =
                  allowed.length === 0 ||
                  allowed.some((a) => a.toLowerCase() === packName.toLowerCase());
                return (
                  <li key={c.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate">
                      {c.name}
                      {allowed.length === 0 ? (
                        <span className="block text-[11px] text-muted-foreground">
                          All packs allowed
                        </span>
                      ) : null}
                    </span>
                    <Switch
                      checked={on}
                      aria-label={`Enable ${packName} in ${c.name}`}
                      onCheckedChange={(v) => toggleCampaign.mutate({ id: c.id, enabled: v })}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {packName && mine ? (
        <div className="panel mb-6 flex flex-wrap items-end gap-3 p-4">
          <div className="space-y-1.5">
            <Label htmlFor="add-entry">Add a library entry to this pack</Label>
            <Select value={addId} onValueChange={setAddId}>
              <SelectTrigger id="add-entry" className="w-72">
                <SelectValue placeholder="Choose an entry…" />
              </SelectTrigger>
              <SelectContent>
                {unpacked.length === 0 ? (
                  <SelectItem value="none" disabled>
                    No other entries available
                  </SelectItem>
                ) : (
                  unpacked.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name} · {e.kind}
                      {e.pack ? ` (${e.pack})` : ""}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          <Button
            disabled={!addId || addId === "none" || moveEntry.isPending}
            onClick={() => moveEntry.mutate({ id: addId, to: packName })}
          >
            Add to pack
          </Button>
        </div>
      ) : null}

      {rows.length === 0 ? (
        <div className="panel p-10 text-center text-sm text-muted-foreground">
          This pack has no entries yet. Add existing library entries above, or import a pack file.
        </div>
      ) : (
        <div className="space-y-6">
          {groupEntriesByKind(rows as LibraryRow[]).map(({ kind, entries }) => (
            <section key={kind} className="panel p-4">
              <h2 className="font-display text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                {kind}s <span className="text-foreground">{entries.length}</span>
              </h2>
              <ul className="mt-3 divide-y divide-border">
                {entries.map((e) => (
                  <li key={e.id} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{e.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[e.category, e.summary].filter(Boolean).join(" · ") || "—"}
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {e.source_label}
                        {e.source_edition ? ` · ${e.source_edition}` : ""}
                        {e.source_page ? ` · p.${e.source_page}` : ""} · {e.visibility}
                      </p>
                    </div>
                    <span className="stat-value text-sm">{e.base_points}</span>
                    {(e.tags ?? []).slice(0, 2).map((t) => (
                      <Badge key={t} variant="outline" className="hidden text-[10px] sm:inline-flex">
                        {t}
                      </Badge>
                    ))}
                    {packName && e.owner_id === user?.id ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => moveEntry.mutate({ id: e.id, to: null })}
                      >
                        Remove from pack
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename pack</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="rename-pack">Name</Label>
            <Input
              id="rename-pack"
              value={nextName}
              onChange={(e) => setNextName(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => rename.mutate()} disabled={rename.isPending}>
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this pack?</AlertDialogTitle>
            <AlertDialogDescription>
              Only the grouping is deleted. Every library entry is kept and moves to{" "}
              {UNPACKED_LABEL}, and entries already copied onto characters are untouched.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => remove.mutate()}>Delete pack</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
