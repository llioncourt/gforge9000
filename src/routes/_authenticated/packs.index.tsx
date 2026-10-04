import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Boxes, Download, ImageUp, Loader2, Plus, Trash2, Upload } from "lucide-react";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ImportDialog } from "@/components/ui/transfer-dialog";
import { AiConversionGuideButton } from "@/components/app/ai-conversion-guide-button";
import {
  createContentPack,
  importLibraryEntries,
  listCampaigns,
  listContentPacks,
  listLibrary,
  deleteContentPack,
  type PackRow,
} from "@/lib/api";
import { parsePortablePack } from "@/lib/portable";
import { campaignsEnablingPack, groupEntriesByPack, makeGroup, type PackGroup } from "@/lib/packs";
import { useSession } from "@/hooks/use-session";
import { packSlug } from "@/lib/pack-slug";
import { canEditPackCover, removePackCoverFile, savePackCover } from "@/lib/pack-cover";
import { CardPortraitBg } from "@/components/character/card-portrait-bg";
import { packCoverMessage } from "@/components/packs/pack-cover-messages";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/hooks";
import { metaText } from "@/i18n/meta";

export const Route = createFileRoute("/_authenticated/packs/")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: metaText("packs", "meta.indexTitle") },
      {
        name: "description",
        content: metaText("packs", "meta.indexDescription"),
      },
      { property: "og:title", content: metaText("packs", "meta.indexTitle") },
      {
        property: "og:description",
        content: metaText("packs", "meta.indexOgDescription"),
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
  const { t } = useT("packs");
  const { t: tc } = useT("common");
  const library = useQuery({ queryKey: ["library"], queryFn: listLibrary });
  const packsQuery = useQuery({ queryKey: ["content-packs"], queryFn: listContentPacks });
  const campaigns = useQuery({ queryKey: ["campaigns"], queryFn: listCampaigns });
  const [search, setSearch] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  /** The pack card an image is currently being dragged over. */
  const [coverTarget, setCoverTarget] = useState<string | null>(null);

  const gmCampaigns = useMemo(
    () => (campaigns.data ?? []).filter((c) => c.gm_id === user?.id),
    [campaigns.data, user?.id],
  );

  const groups = useMemo(() => {
    const grouped = groupEntriesByPack(library.data ?? []);
    const named = new Set(grouped.map((g) => g.pack));
    const empty: PackGroup[] = (packsQuery.data ?? [])
      .filter((p) => !named.has(p.name))
      .map((p) => makeGroup(p.name, []));
    return [...grouped, ...empty].sort((a, b) => a.label.localeCompare(b.label));
  }, [library.data, packsQuery.data]);

  const filtered = groups.filter((g) =>
    `${g.label} ${g.sources.join(" ")}`.toLowerCase().includes(search.toLowerCase()),
  );

  const create = useMutation({
    mutationFn: () => createContentPack({ name: name.trim(), description: description || null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["content-packs"] });
      toast.success(t("toasts.created"));
      setOpen(false);
      setName("");
      setDescription("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const importPackFile = async (file: File, report: (label: string, percent?: number) => void) => {
    report(t("import.reading"), 10);
    const parsed = parsePortablePack(await file.text());
    report(t("import.creating", { name: parsed.pack.name }), 35);
    await createContentPack({
      name: parsed.pack.name,
      description: parsed.pack.description,
      source_label: parsed.pack.source_label,
      source_edition: parsed.pack.source_edition,
      source_type: parsed.pack.source_type,
    }).catch(() => undefined);
    report(t("import.importing", { count: parsed.entries.length }), 55);
    const rows = await importLibraryEntries(parsed.entries as never);
    report(t("import.refreshing"), 90);
    await queryClient.invalidateQueries({ queryKey: ["library"] });
    await queryClient.invalidateQueries({ queryKey: ["content-packs"] });
    return t("import.done", { count: rows.length, name: parsed.pack.name });
  };

  /** An image dropped straight onto a pack's card becomes that pack's cover. */
  const dropCover = useMutation({
    mutationFn: (input: { pack: PackRow | undefined; packName: string; file: File }) =>
      savePackCover(input),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["content-packs"] }),
        queryClient.invalidateQueries({ queryKey: ["packs"] }),
      ]);
      toast.success(t("cover.updated"));
    },
    onError: (error: unknown) => toast.error(packCoverMessage(error, t)),
  });

  const removePack = useMutation({
    mutationFn: async ({
      id,
      name,
      coverPath,
    }: {
      id: string;
      name: string;
      coverPath?: string | null | undefined;
    }) => {
      await deleteContentPack(id, name);
      await removePackCoverFile(coverPath);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["library"] });
      queryClient.invalidateQueries({ queryKey: ["content-packs"] });
      toast.success(t("toasts.deleted"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      <PageHeader
        title={t("page.title")}
        description={t("page.description")}
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> {t("page.newPack")}
          </Button>
        }
      />

      <div className="mb-4 grid gap-3 lg:grid-cols-[1fr_320px]">
        <Input
          className="max-w-xs"
          placeholder={t("filters.searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="grid gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="mr-2 h-4 w-4" /> {t("actions.importPack")}
          </Button>
          <AiConversionGuideButton kind="pack" />
        </div>
      </div>

      {library.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[190px] w-full rounded-lg" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="panel p-10 text-center text-sm text-muted-foreground">
          {t("empty.noPacks")}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((g) => {
            const meta = (packsQuery.data ?? []).find((p) => p.name === g.pack);
            const enabledIn = campaignsEnablingPack(g.pack, gmCampaigns);
            const canDropCover = canEditPackCover({
              pack: meta,
              userId: user?.id,
              entries: g.entries,
            });
            const dropping = coverTarget === g.pack;
            const uploadingCover = dropCover.isPending && dropCover.variables?.packName === g.pack;
            return (
              <Link
                key={g.label}
                to="/packs/$pack"
                params={{ pack: packSlug(g.pack) }}
                className={cn(
                  "panel relative flex flex-col overflow-hidden p-4 transition-colors hover:border-ring",
                  dropping && "border-ring ring-2 ring-ring",
                )}
                data-pack-card={g.pack}
                onDragOver={(e) => {
                  if (!canDropCover || !e.dataTransfer.types.includes("Files")) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "copy";
                  if (!dropping) setCoverTarget(g.pack);
                }}
                onDragLeave={(e) => {
                  if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
                  setCoverTarget((current) => (current === g.pack ? null : current));
                }}
                onDrop={(e) => {
                  if (!canDropCover || !e.dataTransfer.types.includes("Files")) return;
                  e.preventDefault();
                  setCoverTarget(null);
                  const file = e.dataTransfer.files[0];
                  if (file && !dropCover.isPending) {
                    dropCover.mutate({ pack: meta, packName: g.pack, file });
                  }
                }}
              >
                <CardPortraitBg path={meta?.cover_path} />
                <div className="relative flex flex-1 flex-col">
                  <div className="flex items-start gap-2">
                    <Boxes className="mt-0.5 h-4 w-4 text-primary" />
                    <div className="min-w-0">
                      <p className="truncate font-medium">{g.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {t("card.entries", { count: g.total })}
                      </p>
                    </div>
                    {meta && user?.id && meta.owner_id !== user.id ? (
                      <Badge variant="secondary" className="ml-auto text-[10px]">
                        {t("card.shared")}
                      </Badge>
                    ) : null}
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
                    {g.sources.length
                      ? g.sources.join(" · ")
                      : (meta?.source_label ?? t("card.userContent"))}
                    {g.visibilities.length ? ` · ${g.visibilities.join(", ")}` : ""}
                  </p>
                  <p className="mt-auto pt-3 text-[11px] text-muted-foreground">
                    {enabledIn.length
                      ? t("card.enabledIn", { campaigns: enabledIn.map((c) => c.name).join(", ") })
                      : t("card.notEnabled")}
                  </p>
                </div>
                {dropping || uploadingCover ? (
                  <div
                    className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center gap-2 bg-background/80 text-sm font-medium"
                    role="status"
                  >
                    {uploadingCover ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ImageUp className="h-4 w-4" />
                    )}
                    {uploadingCover ? t("card.uploadingCover") : t("card.dropCover")}
                  </div>
                ) : null}
                {meta && user?.id && meta.owner_id === user.id ? (
                  <div
                    className="absolute bottom-3 right-3 z-10"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                  >
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <button
                          type="button"
                          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                          aria-label={t("deleteDialog.deletePackAria")}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{t("deleteDialog.confirmTitle")}</AlertDialogTitle>
                          <AlertDialogDescription>
                            {t("deleteDialog.confirmDescriptionList", { name: g.label })}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{tc("actions.cancel")}</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() =>
                              removePack.mutate({
                                id: meta.id,
                                name: g.pack,
                                coverPath: meta.cover_path,
                              })
                            }
                            disabled={removePack.isPending}
                          >
                            {t("actions.deletePack")}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                ) : null}
              </Link>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("newDialog.title")}</DialogTitle>
            <DialogDescription>{t("newDialog.description")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="pack-name">{t("newDialog.name")}</Label>
              <Input id="pack-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pack-desc">{t("newDialog.description2")}</Label>
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
              {tc("actions.cancel")}
            </Button>
            <Button onClick={() => create.mutate()} disabled={!name.trim() || create.isPending}>
              <Download className="mr-2 hidden h-4 w-4" />
              {t("newDialog.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        title={t("importDialog.title")}
        description={t("importDialog.description")}
        accept="application/json,.json"
        label={t("importDialog.dropLabel")}
        run={importPackFile}
      />
    </div>
  );
}
