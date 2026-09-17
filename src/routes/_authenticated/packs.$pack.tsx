import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTransferTask } from "@/components/ui/transfer-dialog";
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
  deletePackContents,
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
  NO_PACKS_MARKER,
  DEFAULT_PACK_NAME,
} from "@/lib/packs";
import { packFromSlug, packSlug } from "@/lib/pack-slug";
import { slugify } from "@/lib/portable";
import { useSession } from "@/hooks/use-session";
import { useT } from "@/i18n/hooks";
import { metaText } from "@/i18n/meta";

export const Route = createFileRoute("/_authenticated/packs/$pack")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: metaText("packs", "meta.detailTitle") },
      {
        name: "description",
        content: metaText("packs", "meta.detailDescription"),
      },
      { property: "og:title", content: metaText("packs", "meta.detailTitle") },
      { property: "og:description", content: metaText("packs", "meta.detailOgDescription") },
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
  const { t } = useT("packs");
  const { t: tc } = useT("common");

  const library = useQuery({ queryKey: ["library"], queryFn: listLibrary });
  const packsQuery = useQuery({ queryKey: ["content-packs"], queryFn: listContentPacks });
  const campaigns = useQuery({ queryKey: ["campaigns"], queryFn: listCampaigns });

  const [renameOpen, setRenameOpen] = useState(false);
  const [nextName, setNextName] = useState(packName ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [addId, setAddId] = useState("");
  const exportTask = useTransferTask();

  const rows = useMemo(
    () => (library.data ?? []).filter((e) => (e.pack ?? "") === packName),
    [library.data, packName],
  );
  const group = makeGroup(packName, rows);
  const meta = (packsQuery.data ?? []).find((p) => p.name === packName);
  const mine = !meta || meta.owner_id === user?.id;
  const gmCampaigns = (campaigns.data ?? []).filter((c) => c.gm_id === user?.id);

  const unpacked = useMemo(
    () =>
      (library.data ?? []).filter((e) => (e.pack ?? "") !== packName && e.owner_id === user?.id),
    [library.data, packName, user?.id],
  );

  const rename = useMutation({
    mutationFn: async () => {
      const target = nextName.trim();
      if (!target) throw new Error(t("renameDialog.errorNameRequired"));
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
      toast.success(t("toasts.renamed"));
      navigate({ to: "/packs/$pack", params: { pack: packSlug(target) }, replace: true });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async () => {
      if (meta) await deleteContentPack(meta.id, packName);
      else await deletePackContents(packName);
    },
    onSuccess: () => {
      queryClient.invalidateQueries();
      toast.success(t("toasts.deletedKeepsCustom"));
      navigate({ to: "/packs" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const moveEntry = useMutation({
    mutationFn: ({ id, to }: { id: string; to: string }) => setLibraryEntryPack(id, to),
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
          ? allPackNames.filter((n) => n.toLowerCase() !== packName.toLowerCase()).length
            ? allPackNames.filter((n) => n.toLowerCase() !== packName.toLowerCase())
            : [NO_PACKS_MARKER]
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
        <ArrowLeft className="h-4 w-4" /> {t("allPacksLink")}
      </Link>
      <PageHeader
        title={group.label}
        description={meta?.description ?? t("detail.defaultContentPack")}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={exportTask.busy}
              onClick={() =>
                void exportTask.run(t("export.task"), async (report) => {
                  report(t("export.building"), 40);
                  const contents = JSON.stringify(
                    toPortablePack(
                      {
                        name: packName,
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
                  );
                  report(t("export.downloading"), 85);
                  download(`${slugify(group.label)}-pack.json`, contents);
                  return t("export.done", { count: rows.length, name: packName });
                })
              }
            >
              <Download className="mr-2 h-4 w-4" /> {t("actions.exportPack")}
            </Button>
            {mine ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    setNextName(packName);
                    setRenameOpen(true);
                  }}
                >
                  <Pencil className="mr-2 h-4 w-4" /> {t("actions.rename")}
                </Button>
                <Button variant="outline" onClick={() => setConfirmDelete(true)}>
                  <Trash2 className="mr-2 h-4 w-4" /> {t("actions.deletePack")}
                </Button>
              </>
            ) : null}
          </div>
        }
      />

      <div className="mb-6 grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="panel p-4">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">{t("detail.provenance")}</p>
          <p className="mt-2 text-sm">
            {group.sources.length
              ? group.sources.join(" · ")
              : (meta?.source_label ?? t("detail.userContent"))}
            {meta?.source_edition ? ` · ${meta.source_edition}` : ""} ·{" "}
            {meta?.source_type ?? "user"} content
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("detail.entries", { count: group.total })} ·{" "}
            {group.kinds.map((k) => `${k.count} ${k.kind}`).join(", ") || t("detail.noEntriesYet")} ·
            visibility {group.visibilities.join(", ") || (meta?.visibility ?? "private")}
          </p>
        </div>

        <div className="panel p-4">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            {t("detail.enabledInCampaigns")}
          </p>
          {gmCampaigns.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">{t("detail.noCampaigns")}</p>
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
                          {t("detail.allPacksAllowed")}
                        </span>
                      ) : null}
                    </span>
                    <Switch
                      checked={on}
                      aria-label={t("detail.enableAria", { pack: packName, campaign: c.name })}
                      onCheckedChange={(v) => toggleCampaign.mutate({ id: c.id, enabled: v })}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {mine ? (
        <div className="panel mb-6 flex flex-wrap items-end gap-3 p-4">
          <div className="space-y-1.5">
            <Label htmlFor="add-entry">{t("detail.addEntryLabel")}</Label>
            <Select value={addId} onValueChange={setAddId}>
              <SelectTrigger id="add-entry" className="w-72">
                <SelectValue placeholder={t("detail.choosePlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {unpacked.length === 0 ? (
                  <SelectItem value="none" disabled>
                    {t("empty.noOtherEntries")}
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
            {t("actions.addToPack")}
          </Button>
        </div>
      ) : null}

      {rows.length === 0 ? (
        <div className="panel p-10 text-center text-sm text-muted-foreground">
          {t("empty.noEntries")}
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
                      <Badge
                        key={t}
                        variant="outline"
                        className="hidden text-[10px] sm:inline-flex"
                      >
                        {t}
                      </Badge>
                    ))}
                    {e.owner_id === user?.id && packName !== DEFAULT_PACK_NAME ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => moveEntry.mutate({ id: e.id, to: DEFAULT_PACK_NAME })}
                      >
                        {t("actions.movePack", { pack: DEFAULT_PACK_NAME })}
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
            <DialogTitle>{t("renameDialog.title")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="rename-pack">{t("renameDialog.name")}</Label>
            <Input
              id="rename-pack"
              value={nextName}
              onChange={(e) => setNextName(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)}>
              {tc("actions.cancel")}
            </Button>
            <Button onClick={() => rename.mutate()} disabled={rename.isPending}>
              {t("renameDialog.rename")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteDialog.confirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteDialog.confirmDescriptionDetail")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc("actions.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => remove.mutate()}>{t("actions.deletePack")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {exportTask.node}
    </div>
  );
}
