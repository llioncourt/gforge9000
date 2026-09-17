import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useT } from "@/i18n/hooks";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Loader2, Plus, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createCampaign, deleteCampaign, joinCampaign, listCampaigns } from "@/lib/api";
import { useSession } from "@/hooks/use-session";
import { CampaignCoverBg } from "@/components/campaign/campaign-cover-bg";
import { CAMPAIGN_COVER_SETTING } from "@/lib/campaign-cover";
import { CampaignPackageImport } from "@/components/campaign/campaign-package-import";
import { Progress } from "@/components/ui/progress";
import { buildCampaignPackageZip, type CampaignExportStep } from "@/lib/campaign-package-export";
import { metaText } from "@/i18n/meta";

export const Route = createFileRoute("/_authenticated/campaigns/")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: metaText("campaigns", "meta.listTitle") },
      {
        name: "description",
        content: metaText("campaigns", "meta.listDescription"),
      },
      { property: "og:title", content: metaText("campaigns", "meta.listTitle") },
      { property: "og:description", content: metaText("campaigns", "meta.listOgDescription") },
    ],
  }),
  component: CampaignsPage,
});

function CampaignsPage() {
  const { t } = useT("campaigns");
  const { t: tc } = useT("common");
  const { user } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["campaigns"], queryFn: listCampaigns });
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [pointLimit, setPointLimit] = useState("150");
  const [disadvLimit, setDisadvLimit] = useState("-50");
  const [tl, setTl] = useState("8");
  const [code, setCode] = useState("");
  const [exporting, setExporting] = useState<string | null>(null);
  const [exportName, setExportName] = useState("");
  const [exportStep, setExportStep] = useState<CampaignExportStep | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportDone, setExportDone] = useState(false);

  const exportCampaign = async (campaignId: string, campaignName: string) => {
    setExporting(campaignId);
    setExportName(campaignName);
    setExportError(null);
    setExportDone(false);
    setExportStep({ label: t("list.export.reading"), done: 0, total: 1, percent: 0 });
    try {
      const { blob, fileName } = await buildCampaignPackageZip(campaignId, (progress) =>
        setExportStep(progress),
      );
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setExportStep({ label: t("list.export.done"), done: 1, total: 1, percent: 100 });
      setExportDone(true);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : t("list.export.failed"));
    } finally {
      setExporting(null);
    }
  };

  const closeExport = () => {
    setExportStep(null);
    setExportError(null);
    setExportDone(false);
  };

  const create = useMutation({
    mutationFn: () =>
      createCampaign({
        name,
        description: description || null,
        settings: {
          point_limit: Number(pointLimit) || 0,
          disadvantage_limit: Number(disadvLimit) || 0,
          tech_level: Number(tl) || 0,
          house_rules: "",
          allowed_sources: ["user"],
        },
      }),
    onSuccess: (row) => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      setOpen(false);
      navigate({ to: "/campaigns/$id", params: { id: row.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const join = useMutation({
    mutationFn: () => joinCampaign(code.trim().toUpperCase()),
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      toast.success(t("list.join.success"));
      setCode("");
      navigate({ to: "/campaigns/$id", params: { id } });
    },
    onError: () => toast.error(t("list.join.error")),
  });

  const remove = useMutation({
    mutationFn: (cid: string) => deleteCampaign(cid),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      toast.success(t("list.deleted"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      <PageHeader
        title={t("list.title")}
        description={t("list.description")}
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" /> {t("list.newCampaign")}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("list.dialog.title")}</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4">
                <CampaignPackageImport
                  onImported={(id) => {
                    setOpen(false);
                    navigate({ to: "/campaigns/$id", params: { id } });
                  }}
                />

                <div className="space-y-1.5">
                  <Label>{t("list.dialog.nameLabel")}</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("list.dialog.premiseLabel")}</Label>
                  <Textarea
                    rows={3}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label>{t("list.dialog.pointLimit")}</Label>
                    <Input value={pointLimit} onChange={(e) => setPointLimit(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("list.dialog.disadvantageLimit")}</Label>
                    <Input value={disadvLimit} onChange={(e) => setDisadvLimit(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("list.dialog.techLevel")}</Label>
                    <Input value={tl} onChange={(e) => setTl(e.target.value)} />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => create.mutate()} disabled={!name || create.isPending}>
                  {t("list.dialog.create")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="panel mb-6 flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-[200px] flex-1 space-y-1.5">
          <Label htmlFor="code">{t("list.join.label")}</Label>
          <Input
            id="code"
            placeholder={t("list.join.placeholder")}
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </div>
        <Button variant="outline" onClick={() => join.mutate()} disabled={!code || join.isPending}>
          {t("list.join.button")}
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[140px] w-full rounded-lg" />
          ))}
        </div>
      ) : (data?.length ?? 0) === 0 ? (
        <div className="panel p-10 text-center">
          <Users className="mx-auto h-6 w-6 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">{t("list.empty")}</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data?.map((c) => {
            const settings = (c.settings ?? {}) as Record<string, number | string | null>;
            const coverPath =
              typeof settings[CAMPAIGN_COVER_SETTING] === "string"
                ? settings[CAMPAIGN_COVER_SETTING]
                : null;
            return (
              <Link
                key={c.id}
                to="/campaigns/$id"
                params={{ id: c.id }}
                className="panel hover-lift relative flex min-h-[180px] flex-col overflow-hidden p-5 transition-colors hover:border-ring"
              >
                <CampaignCoverBg path={coverPath} />
                <div className="relative flex items-start justify-between gap-2">
                  <h2 className="font-display text-lg font-semibold">{c.name}</h2>
                  <Badge variant={c.gm_id === user?.id ? "default" : "outline"}>
                    {c.gm_id === user?.id ? t("list.badge.gm") : t("list.badge.player")}
                  </Badge>
                </div>
                <p className="relative mt-2 line-clamp-3 text-sm text-muted-foreground">
                  {c.description || t("list.noPremise")}
                </p>
                <div className="relative mt-auto flex gap-4 pt-4 text-xs text-muted-foreground">
                  <span>{t("list.points", { count: settings["point_limit"] ?? "—" })}</span>
                  <span>{t("list.techLevelShort", { level: settings["tech_level"] ?? "—" })}</span>
                  <span className="font-mono">{c.invite_code}</span>
                </div>
                {c.gm_id === user?.id ? (
                  <div
                    className="absolute bottom-3 right-3 z-10 flex items-center gap-1"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                  >
                    <button
                      type="button"
                      className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
                      aria-label={t("list.downloadAria")}
                      title={t("list.downloadTitle")}
                      disabled={exporting === c.id}
                      onClick={() => exportCampaign(c.id, c.name)}
                    >
                      {exporting === c.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Download className="h-3.5 w-3.5" />
                      )}
                    </button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <button
                          type="button"
                          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                          aria-label={t("list.deleteAria")}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{t("list.deleteConfirmTitle")}</AlertDialogTitle>
                          <AlertDialogDescription>
                            {t("list.deleteConfirmBody", { name: c.name })}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{tc("actions.cancel")}</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => remove.mutate(c.id)}
                            disabled={remove.isPending}
                          >
                            {t("list.deleteConfirmButton")}
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

      <Dialog
        open={exportStep !== null}
        onOpenChange={(next) => {
          if (!next && !exporting) closeExport();
        }}
      >
        <DialogContent
          className="sm:max-w-md"
          onInteractOutside={(event) => {
            if (exporting) event.preventDefault();
          }}
          onEscapeKeyDown={(event) => {
            if (exporting) event.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {t("list.export.title", { name: exportName || t("list.export.fallbackName") })}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Progress value={exportError ? 100 : (exportStep?.percent ?? 0)} />
            <div className="flex items-center justify-between text-sm">
              <span className={exportError ? "text-destructive" : "text-muted-foreground"}>
                {exportError ??
                  (exportDone ? t("list.export.downloaded") : (exportStep?.label ?? ""))}
              </span>
              <span className="tabular-nums text-muted-foreground">
                {exportError ? "" : `${exportStep?.percent ?? 0}%`}
              </span>
            </div>
            {!exportError && exportStep && exportStep.total > 1 ? (
              <p className="text-xs text-muted-foreground">
                {t("list.export.itemsPacked", { done: exportStep.done, total: exportStep.total })}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeExport} disabled={Boolean(exporting)}>
              {t("list.export.close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
