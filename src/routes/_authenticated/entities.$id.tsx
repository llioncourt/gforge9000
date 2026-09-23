import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ImageZoom } from "@/components/ui/image-zoom";
import { listAssets } from "@/lib/assets";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  fieldLabelKey,
  kindDef,
  kindLabelKey,
  optionLabelKey,
  relationshipLabelKey,
  RELATIONSHIP_TYPES,
  statusLabelKey,
  VISIBILITIES,
} from "@/lib/entity-kinds";
import {
  createRelationship,
  dataValue,
  deleteEntity,
  deleteRelationship,
  getEntity,
  listEntities,
  listEntityRevisions,
  listGrants,
  listRelationships,
  snapshotEntity,
  updateEntity,
  withDataValue,
  type EntityRow,
} from "@/lib/lore";
import { getCampaign, listCampaignCharacters, listMembers } from "@/lib/api";
import { useSession } from "@/hooks/use-session";
import { revealEntityToPlayer, revokeEntityReveal } from "@/lib/reveal";
import { isPlayerVisible } from "@/lib/visibility";
import { useLoreRealtime } from "@/hooks/use-lore-realtime";
import { decideSync } from "@/lib/form-sync";
import { VisibilityBadge } from "@/components/lore/visibility-badge";
import { FileDropzone } from "@/components/ui/FileDropzone";
import { LibraryImagePicker } from "@/components/lore/library-image-picker";
import { entityImageUrl } from "@/lib/entity-image";
import { portraitInitials, removePortrait, uploadPortrait } from "@/lib/portrait";
import { useT, useFormatters } from "@/i18n/hooks";
import { metaText } from "@/i18n/meta";

export const Route = createFileRoute("/_authenticated/entities/$id")({
  staticData: { sitemap: false },
  validateSearch: (search: Record<string, unknown>): { from?: string } => {
    const from = search["from"];
    return typeof from === "string" && from ? { from } : {};
  },
  head: () => ({
    meta: [
      { title: metaText("lore", "meta.entityTitle") },
      {
        name: "description",
        content: metaText("lore", "meta.entityDescription"),
      },
      { property: "og:title", content: metaText("lore", "meta.entityTitle") },
      { property: "og:description", content: metaText("lore", "meta.entityOgDescription") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EntityPage,
});

function EntityPage() {
  const { id } = Route.useParams();
  const { from } = Route.useSearch();
  const { user } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useT("lore");
  const { t: tc } = useT("common");
  // Entity kind/field/status labels come from data-driven key builders.
  const tk = t as (key: string, options?: Record<string, unknown>) => string;
  const f = useFormatters();

  const entity = useQuery({ queryKey: ["entity", id], queryFn: () => getEntity(id) });
  const campaignId = entity.data?.campaign_id;
  useLoreRealtime(campaignId, id);
  const campaign = useQuery({
    queryKey: ["campaign", campaignId],
    queryFn: () => getCampaign(campaignId!),
    enabled: !!campaignId,
  });
  const siblings = useQuery({
    queryKey: ["lore-entities", campaignId],
    queryFn: () => listEntities(campaignId!),
    enabled: !!campaignId,
  });
  const relationships = useQuery({
    queryKey: ["lore-relationships", campaignId],
    queryFn: () => listRelationships(campaignId!),
    enabled: !!campaignId,
  });
  const members = useQuery({
    queryKey: ["members", campaignId],
    queryFn: () => listMembers(campaignId!),
    enabled: !!campaignId,
  });
  const grants = useQuery({ queryKey: ["lore-grants", id], queryFn: () => listGrants(id) });
  const campaignCharacters = useQuery({
    queryKey: ["campaign-characters", campaignId],
    queryFn: () => listCampaignCharacters(campaignId!),
    enabled: !!campaignId,
  });
  const linkedSheetId = entity.data ? dataValue(entity.data, "character_sheet_id") : "";
  const linkedCharacter = (campaignCharacters.data ?? []).find((c) => c.id === linkedSheetId);
  const inheritedPortrait = linkedSheetId ? (linkedCharacter?.portrait_path ?? null) : null;
  // Own image wins, but a missing/broken file falls back to the linked sheet portrait.
  const [ownImageBroken, setOwnImageBroken] = useState(false);
  const ownImagePath = ownImageBroken ? null : (entity.data?.image_url ?? null);
  const entityImagePath = ownImagePath ?? inheritedPortrait;
  useEffect(() => {
    setOwnImageBroken(false);
  }, [entity.data?.image_url]);
  const photoUrl = useQuery({
    queryKey: ["entity-photo", entityImagePath, id],
    queryFn: () => entityImageUrl(entityImagePath, id),
    enabled: !!entityImagePath,
  });
  // An entry image "from library" points at a campaign_assets file instead of
  // its own upload — detected by matching the storage path.
  const libraryAssets = useQuery({
    queryKey: ["assets", campaignId],
    queryFn: () => listAssets(campaignId!),
    enabled: !!campaignId && !!entity.data?.image_url,
    staleTime: 1000 * 60 * 5,
  });
  const isLibraryImage =
    !!entity.data?.image_url &&
    (libraryAssets.data ?? []).some((row) => row.storage_path === entity.data?.image_url);

  const uploadPhoto = useMutation({
    mutationFn: async (file: File) => {
      const path = await uploadPortrait(id, file);
      await updateEntity(id, { image_url: path });
      return path;
    },
    onSuccess: async (path) => {
      setForm((prev) => (prev ? ({ ...prev, image_url: path } as EntityRow) : prev));
      await queryClient.invalidateQueries({ queryKey: ["entity", id] });
      await queryClient.invalidateQueries({ queryKey: ["entity-photo"] });
      await queryClient.invalidateQueries({ queryKey: ["lore-entities", campaignId] });
      toast.success(t("entityPage.toasts.photoUpdated"));
    },
    onError: (error: Error) => toast.error(error.message),
  });
  // Library images are shared files: point at them, never copy or delete them.
  const pickLibraryImage = useMutation({
    mutationFn: async (path: string) => {
      await updateEntity(id, { image_url: path });
      return path;
    },
    onSuccess: async (path) => {
      setForm((prev) => (prev ? ({ ...prev, image_url: path } as EntityRow) : prev));
      await queryClient.invalidateQueries({ queryKey: ["entity", id] });
      await queryClient.invalidateQueries({ queryKey: ["entity-photo"] });
      await queryClient.invalidateQueries({ queryKey: ["lore-entities", campaignId] });
      toast.success(t("entityPage.toasts.imageLinked"));
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const removePhoto = useMutation({
    mutationFn: async (path: string) => {
      await updateEntity(id, { image_url: null });
      await removePortrait(path).catch(() => undefined);
    },
    onSuccess: async () => {
      setForm((prev) => (prev ? ({ ...prev, image_url: null } as EntityRow) : prev));
      await queryClient.invalidateQueries({ queryKey: ["entity", id] });
      await queryClient.invalidateQueries({ queryKey: ["entity-photo"] });
      await queryClient.invalidateQueries({ queryKey: ["lore-entities", campaignId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const isGm = !!campaign.data && campaign.data.gm_id === user?.id;
  const canEdit = isGm || entity.data?.owner_user_id === user?.id;
  const def = useMemo(() => kindDef(entity.data?.kind ?? "CUSTOM"), [entity.data?.kind]);
  const backTab = entity.data?.kind === "EVENT" ? "timeline" : "lore";

  const [form, setForm] = useState<EntityRow | null>(null);
  // The last copy that came from the server; used to tell edits apart from refreshes.
  const baseline = useRef<EntityRow | null>(null);
  const [staleWarning, setStaleWarning] = useState(false);
  useEffect(() => {
    const incoming = entity.data ?? null;
    const decision = decideSync(baseline.current, form, incoming);
    if (decision === "apply" && incoming) {
      baseline.current = incoming;
      setForm(incoming);
      setStaleWarning(false);
    } else if (decision === "keep-local") {
      setStaleWarning(true);
    }
    // form is intentionally read, not tracked: this runs on server refreshes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity.data]);

  const takeServerVersion = () => {
    if (!entity.data) return;
    baseline.current = entity.data;
    setForm(entity.data);
    setStaleWarning(false);
  };

  const revisions = useQuery({
    queryKey: ["lore-revisions", id],
    queryFn: () => listEntityRevisions(id),
  });

  const save = useMutation({
    mutationFn: async (patch: Partial<EntityRow>) => {
      const previous = entity.data;
      if (previous) {
        try {
          await snapshotEntity(previous);
        } catch {
          /* history is best-effort */
        }
      }
      return updateEntity(id, patch);
    },
    onSuccess: async (row) => {
      baseline.current = row;
      setForm(row);
      setStaleWarning(false);
      await queryClient.invalidateQueries({ queryKey: ["entity", id] });
      await queryClient.invalidateQueries({ queryKey: ["lore-revisions", id] });
      await queryClient.invalidateQueries({ queryKey: ["lore-entities", row.campaign_id] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const restore = useMutation({
    mutationFn: async (snapshot: Record<string, unknown>) =>
      updateEntity(id, {
        name: String(snapshot["name"] ?? ""),
        summary: (snapshot["summary"] ?? null) as string | null,
        player_description: (snapshot["player_description"] ?? null) as string | null,
        description: (snapshot["description"] ?? null) as string | null,
        gm_notes: (snapshot["gm_notes"] ?? null) as string | null,
        status: String(snapshot["status"] ?? ""),
        visibility: String(snapshot["visibility"] ?? ""),
        tags: (snapshot["tags"] ?? []) as string[],
        data: (snapshot["data"] ?? {}) as never,
      }),
    onSuccess: async (row) => {
      baseline.current = row;
      setForm(row);
      setStaleWarning(false);
      toast.success(t("entityPage.toasts.versionRestored"));
      await queryClient.invalidateQueries({ queryKey: ["entity", id] });
      await queryClient.invalidateQueries({ queryKey: ["lore-entities", row.campaign_id] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: () => deleteEntity(id),
    onSuccess: async () => {
      toast.success(t("entityPage.toasts.entryDeleted"));
      await queryClient.invalidateQueries({ queryKey: ["lore-entities", campaignId] });
      if (campaignId) navigate({ to: "/campaigns/$id", params: { id: campaignId } });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const [relTarget, setRelTarget] = useState("");
  const [relType, setRelType] = useState(RELATIONSHIP_TYPES[0]!);
  const addRelationship = useMutation({
    mutationFn: () =>
      createRelationship({
        campaign_id: campaignId!,
        source_id: id,
        target_id: relTarget,
        rel_type: relType,
      }),
    onSuccess: async () => {
      setRelTarget("");
      await queryClient.invalidateQueries({ queryKey: ["lore-relationships", campaignId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const dropRelationship = useMutation({
    mutationFn: (relId: string) => deleteRelationship(relId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["lore-relationships", campaignId] }),
    onError: (error: Error) => toast.error(error.message),
  });

  const toggleGrant = useMutation({
    mutationFn: async (userId: string) => {
      const row = entity.data;
      if (!row) throw new Error(t("entityPage.errors.recordNotLoaded"));
      const existing = (grants.data ?? []).find((g) => g.user_id === userId);
      if (existing) {
        const remaining = (grants.data ?? []).filter((g) => g.id !== existing.id).length;
        const result = await revokeEntityReveal({
          grantId: existing.id,
          entity: row,
          remainingGrants: remaining,
        });
        return result.demoted
          ? t("entityPage.toasts.revealRemovedDemoted")
          : t("entityPage.toasts.revealRemoved");
      }
      const result = await revealEntityToPlayer({ entity: row, userId, gmId: user!.id });
      if (result.alreadyPublic) return t("entityPage.toasts.revealedAlreadyPublic");
      if (result.promotedTo) return t("entityPage.toasts.revealedPromoted");
      return t("entityPage.toasts.revealedToPlayer");
    },
    onSuccess: async (message) => {
      toast.success(message);
      await queryClient.invalidateQueries({ queryKey: ["lore-grants", id] });
      await queryClient.invalidateQueries({ queryKey: ["entity", id] });
      await queryClient.invalidateQueries({ queryKey: ["lore-entities", campaignId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const nameOf = (entityId: string) =>
    (siblings.data ?? []).find((row) => row.id === entityId)?.name ?? t("entityPage.unknownEntity");

  const links = (relationships.data ?? []).filter(
    (row) => row.source_id === id || row.target_id === id,
  );

  const myName = (entity.data?.name ?? "").trim();
  const mentions =
    myName.length < 3
      ? []
      : (siblings.data ?? []).filter((row) => {
          if (row.id === id) return false;
          const haystack = [
            row.summary ?? "",
            row.player_description ?? "",
            isGm ? (row.gm_notes ?? "") : "",
            JSON.stringify(row.data ?? {}),
          ]
            .join("\n")
            .toLowerCase();
          return haystack.includes(myName.toLowerCase());
        });

  if (entity.isLoading || !form) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const patch = (next: Partial<EntityRow>) => {
    setForm({ ...form, ...next } as EntityRow);
  };
  const commit = (next: Partial<EntityRow>) => save.mutate(next);

  return (
    <div className="space-y-6">
      {staleWarning ? (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm"
        >
          <span>{t("entityPage.staleNotice")}</span>
          <Button size="sm" variant="outline" onClick={takeServerVersion}>
            {t("entityPage.staleDiscard")}
          </Button>
        </div>
      ) : null}
      <PageHeader
        title={form.name}
        description={t("entityPage.headerDescription", {
          kind: tk(kindLabelKey(entity.data?.kind ?? "CUSTOM")),
          campaign: campaign.data?.name ?? t("entityPage.defaultCampaignName"),
        })}
        actions={
          <div className="flex items-center gap-2">
            {campaignId ? (
              <Button variant="outline" asChild>
                <Link
                  to="/campaigns/$id"
                  params={{ id: campaignId }}
                  search={{ tab: (from ?? backTab) as never }}
                >
                  <ArrowLeft className="mr-2 size-4" /> {t("entityPage.backToCampaign")}
                </Link>
              </Button>
            ) : null}
            {isGm ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive">
                    <Trash2 className="mr-2 size-4" /> {t("entityPage.deleteDialog.trigger")}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t("entityPage.deleteDialog.title")}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {t("entityPage.deleteDialog.description")}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{tc("actions.cancel")}</AlertDialogCancel>
                    <AlertDialogAction onClick={() => remove.mutate()}>
                      {t("entityPage.deleteDialog.confirm")}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : null}
          </div>
        }
      />

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">{t("entityPage.tabs.overview")}</TabsTrigger>
          <TabsTrigger value="details">{t("entityPage.tabs.details")}</TabsTrigger>
          <TabsTrigger value="links">{t("entityPage.tabs.links")}</TabsTrigger>
          <TabsTrigger value="history">{t("entityPage.tabs.history")}</TabsTrigger>
          {isGm ? <TabsTrigger value="reveals">{t("entityPage.tabs.reveals")}</TabsTrigger> : null}
        </TabsList>

        <TabsContent value="overview" className="space-y-4 pt-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="entity-name">{t("entityPage.fields.name")}</Label>
              <Input
                id="entity-name"
                value={form.name}
                disabled={!canEdit}
                onChange={(event) => patch({ name: event.target.value })}
                onBlur={() => commit({ name: form.name })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="entity-status">{t("entityPage.fields.status")}</Label>
              <Select
                value={form.status}
                disabled={!canEdit}
                onValueChange={(value) => {
                  patch({ status: value });
                  commit({ status: value });
                }}
              >
                <SelectTrigger id="entity-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {def.statuses.map((status) => (
                    <SelectItem key={status} value={status}>
                      {tk(statusLabelKey(form.kind, status))}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {isGm ? (
              <div className="space-y-2">
                <Label htmlFor="entity-visibility">{t("entityPage.fields.visibility")}</Label>
                <Select
                  value={form.visibility}
                  onValueChange={(value) => {
                    patch({ visibility: value });
                    commit({ visibility: value });
                  }}
                >
                  <SelectTrigger id="entity-visibility">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VISIBILITIES.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="entity-tags">{t("entityPage.fields.tags")}</Label>
              <Input
                id="entity-tags"
                value={form.tags.join(", ")}
                disabled={!canEdit}
                onChange={(event) =>
                  patch({
                    tags: event.target.value
                      .split(",")
                      .map((tag) => tag.trim())
                      .filter(Boolean),
                  })
                }
                onBlur={() => commit({ tags: form.tags })}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{t("entityPage.fields.image")}</Label>
              {entityImagePath ? (
                <div className="flex items-start gap-3">
                  {photoUrl.data ? (
                    <div className="relative h-32 w-32">
                      <ImageZoom
                        src={photoUrl.data}
                        alt={t("entityPage.image.alt", { name: form.name })}
                        onError={() => setOwnImageBroken(true)}
                        className="h-32 w-32 rounded-lg border"
                      />
                      {isLibraryImage ? (
                        <Badge
                          variant="secondary"
                          className="pointer-events-none absolute top-1 left-1 shadow"
                        >
                          {t("entityPage.image.fromLibrary")}
                        </Badge>
                      ) : !ownImagePath && inheritedPortrait ? (
                        <Badge
                          variant="secondary"
                          className="pointer-events-none absolute top-1 left-1 shadow"
                        >
                          {t("entityPage.image.fromChar")}
                        </Badge>
                      ) : null}
                    </div>
                  ) : (
                    <Skeleton className="h-32 w-32 rounded-lg" />
                  )}
                  {canEdit ? (
                    <div className="space-y-2">
                      <FileDropzone
                        compact
                        accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
                        label={t("entityPage.image.dropNew")}
                        loading={uploadPhoto.isPending}
                        loadingLabel={t("entityPage.image.uploading")}
                        onFiles={(files) => {
                          const file = files[0];
                          if (file) uploadPhoto.mutate(file);
                        }}
                      />
                      {campaignId ? (
                        <LibraryImagePicker
                          campaignId={campaignId}
                          disabled={pickLibraryImage.isPending}
                          onPick={(path) => pickLibraryImage.mutate(path)}
                        />
                      ) : null}
                      {form.image_url ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removePhoto.mutate(form.image_url!)}
                          disabled={removePhoto.isPending}
                        >
                          <Trash2 className="mr-2 size-4" /> {t("entityPage.image.removeImage")}
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : canEdit ? (
                <div className="space-y-2">
                  <FileDropzone
                    accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
                    label={t("entityPage.image.dropNewOf", {
                      name: form.name || t("entityPage.image.thisEntry"),
                    })}
                    hint={t("entityPage.image.hint")}
                    loading={uploadPhoto.isPending}
                    loadingLabel={t("entityPage.image.uploading")}
                    onFiles={(files) => {
                      const file = files[0];
                      if (file) uploadPhoto.mutate(file);
                    }}
                  />
                  {campaignId ? (
                    <LibraryImagePicker
                      campaignId={campaignId}
                      disabled={pickLibraryImage.isPending}
                      onPick={(path) => pickLibraryImage.mutate(path)}
                    />
                  ) : null}
                </div>
              ) : (
                <div className="flex h-32 w-32 items-center justify-center rounded-lg border bg-muted text-2xl font-semibold text-muted-foreground">
                  {portraitInitials(form.name)}
                </div>
              )}
              {!ownImagePath && inheritedPortrait ? (
                <p className="text-muted-foreground text-xs">
                  {t("entityPage.image.inheritedNote")}
                </p>
              ) : null}
            </div>
            {form.kind === "NPC" ? (
              <div className="space-y-2">
                <Label htmlFor="entity-sheet">{t("entityPage.fields.characterSheet")}</Label>
                <Select
                  value={dataValue(form, "character_sheet_id") || "none"}
                  disabled={!canEdit}
                  onValueChange={(value) => {
                    const data = withDataValue(
                      form,
                      "character_sheet_id",
                      value === "none" ? "" : value,
                      false,
                    );
                    patch({ data: data as never });
                    commit({ data: data as never });
                  }}
                >
                  <SelectTrigger id="entity-sheet">
                    <SelectValue placeholder={t("entityPage.fields.noLinkedSheet")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("entityPage.fields.noLinkedSheet")}</SelectItem>
                    {(campaignCharacters.data ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {dataValue(form, "character_sheet_id") ? (
                  <Button variant="outline" size="sm" asChild>
                    <Link
                      to="/characters/$id"
                      params={{ id: dataValue(form, "character_sheet_id") }}
                      search={{ from: `entity:${id}` }}
                    >
                      <ExternalLink className="mr-2 size-4" />{" "}
                      {t("entityPage.image.openCharacterSheet")}
                    </Link>
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="entity-summary">{t("entityPage.fields.summary")}</Label>
            <Textarea
              id="entity-summary"
              rows={2}
              value={form.summary ?? ""}
              disabled={!canEdit}
              onChange={(event) => patch({ summary: event.target.value })}
              onBlur={() => commit({ summary: form.summary })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="entity-player">{t("entityPage.fields.playerDescription")}</Label>
            <Textarea
              id="entity-player"
              rows={4}
              value={form.player_description ?? ""}
              disabled={!canEdit}
              onChange={(event) => patch({ player_description: event.target.value })}
              onBlur={() => commit({ player_description: form.player_description })}
            />
          </div>
          {isGm ? (
            <div className="space-y-2">
              <Label htmlFor="entity-gm">{t("entityPage.fields.gmNotes")}</Label>
              <Textarea
                id="entity-gm"
                rows={4}
                value={form.gm_notes ?? ""}
                onChange={(event) => patch({ gm_notes: event.target.value })}
                onBlur={() => commit({ gm_notes: form.gm_notes })}
              />
            </div>
          ) : null}
        </TabsContent>

        <TabsContent value="details" className="space-y-4 pt-4">
          {def.fields
            .filter((field) => isGm || !field.gm)
            .map((field) => {
              const value = dataValue(form, field.key);
              const setValue = (next: string) =>
                patch({
                  data: withDataValue(form, field.key, next, field.type === "list") as never,
                });
              return (
                <div key={field.key} className="space-y-2">
                  <Label htmlFor={`field-${field.key}`}>
                    {tk(fieldLabelKey(form.kind, field.key))}
                    {field.gm ? (
                      <Badge variant="outline" className="ml-2">
                        {t("entityPage.details.gmBadge")}
                      </Badge>
                    ) : null}
                  </Label>
                  {field.type === "select" ? (
                    <Select
                      value={value}
                      disabled={!canEdit}
                      onValueChange={(next) => {
                        const data = withDataValue(form, field.key, next, false);
                        patch({ data: data as never });
                        commit({ data: data as never });
                      }}
                    >
                      <SelectTrigger id={`field-${field.key}`}>
                        <SelectValue placeholder={t("entityPage.details.selectPlaceholder")} />
                      </SelectTrigger>
                      <SelectContent>
                        {(field.options ?? []).map((option) => (
                          <SelectItem key={option} value={option}>
                            {tk(optionLabelKey(form.kind, field.key, option))}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : field.type === "text" ? (
                    <Input
                      id={`field-${field.key}`}
                      value={value}
                      disabled={!canEdit}
                      onChange={(event) => setValue(event.target.value)}
                      onBlur={() => commit({ data: form.data })}
                    />
                  ) : (
                    <Textarea
                      id={`field-${field.key}`}
                      rows={field.type === "list" ? 3 : 4}
                      placeholder={
                        field.type === "list" ? t("entityPage.details.onePerLine") : undefined
                      }
                      value={value}
                      disabled={!canEdit}
                      onChange={(event) => setValue(event.target.value)}
                      onBlur={() => commit({ data: form.data })}
                    />
                  )}
                </div>
              );
            })}
        </TabsContent>

        <TabsContent value="links" className="space-y-4 pt-4">
          {isGm ? (
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-2">
                <Label htmlFor="rel-type">{t("entityPage.links.relationshipLabel")}</Label>
                <Select value={relType} onValueChange={setRelType}>
                  <SelectTrigger id="rel-type" className="w-56">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RELATIONSHIP_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {tk(relationshipLabelKey(type))}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="rel-target">{t("entityPage.links.targetLabel")}</Label>
                <Select value={relTarget} onValueChange={setRelTarget}>
                  <SelectTrigger id="rel-target" className="w-64">
                    <SelectValue placeholder={t("entityPage.links.targetPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {(siblings.data ?? [])
                      .filter((row) => row.id !== id)
                      .map((row) => (
                        <SelectItem key={row.id} value={row.id}>
                          {row.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={() => addRelationship.mutate()}
                disabled={!relTarget || addRelationship.isPending}
              >
                <Plus className="mr-2 size-4" /> {t("entityPage.links.linkButton")}
              </Button>
            </div>
          ) : null}

          {links.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("entityPage.links.empty")}</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {links.map((row) => {
                const outgoing = row.source_id === id;
                const other = outgoing ? row.target_id : row.source_id;
                return (
                  <li key={row.id} className="flex items-center gap-3 p-3">
                    <span className="text-muted-foreground text-xs uppercase">
                      {outgoing ? "→" : "←"} {tk(relationshipLabelKey(row.rel_type))}
                    </span>
                    <Link
                      to="/entities/$id"
                      params={{ id: other }}
                      className="font-medium hover:underline"
                    >
                      {nameOf(other)}
                    </Link>
                    {isGm ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="ml-auto"
                        aria-label={t("entityPage.links.removeAria")}
                        onClick={() => dropRelationship.mutate(row.id)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}

          <div className="space-y-2">
            <h2 className="text-sm font-semibold">{t("entityPage.links.mentionsTitle")}</h2>
            {mentions.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                {t("entityPage.links.mentionsEmpty", { name: form.name })}
              </p>
            ) : (
              <ul className="divide-y rounded-lg border">
                {mentions.map((row) => (
                  <li key={row.id} className="flex items-center gap-3 p-3">
                    <span className="text-muted-foreground text-xs uppercase">
                      {tk(kindLabelKey(row.kind))}
                    </span>
                    <Link
                      to="/entities/$id"
                      params={{ id: row.id }}
                      className="font-medium hover:underline"
                    >
                      {row.name}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </TabsContent>

        <TabsContent value="history" className="space-y-4 pt-4">
          <p className="text-muted-foreground text-sm">{t("entityPage.history.intro")}</p>
          {revisions.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : (revisions.data ?? []).length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("entityPage.history.empty")}</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {(revisions.data ?? []).map((row) => {
                const snapshot = (row.snapshot ?? {}) as Record<string, unknown>;
                return (
                  <li key={row.id} className="flex items-center gap-3 p-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {String(snapshot["name"] ?? form.name)}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {row.label
                          ? t("entityPage.history.entryDateLabel", {
                              date: f.dateTime(row.created_at),
                              label: row.label,
                            })
                          : f.dateTime(row.created_at)}
                      </p>
                    </div>
                    {canEdit ? (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" size="sm" className="ml-auto">
                            {t("entityPage.history.restore")}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              {t("entityPage.history.restoreDialogTitle")}
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              {t("entityPage.history.restoreDialogDescription")}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>{tc("actions.cancel")}</AlertDialogCancel>
                            <AlertDialogAction onClick={() => restore.mutate(snapshot)}>
                              {t("entityPage.history.restore")}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </TabsContent>

        {isGm ? (
          <TabsContent value="reveals" className="space-y-4 pt-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">
                {t("entityPage.reveals.currentVisibility")}
              </span>
              <VisibilityBadge visibility={form.visibility} isGm={isGm} />
            </div>
            <p className="text-muted-foreground text-sm">
              {isPlayerVisible(form.visibility)
                ? t("entityPage.reveals.alreadyVisible")
                : t("entityPage.reveals.revealSwitchesNote")}
            </p>
            <ul className="divide-y rounded-lg border">
              {(members.data ?? [])
                .filter((member) => member.role !== "gm" && member.user_id !== user?.id)
                .map((member) => {
                  const granted = (grants.data ?? []).some((g) => g.user_id === member.user_id);
                  return (
                    <li key={member.user_id} className="flex items-center gap-3 p-3">
                      <span className="font-medium">
                        {member.display_name ?? member.user_id.slice(0, 8)}
                      </span>
                      <Button
                        variant={granted ? "default" : "outline"}
                        size="sm"
                        className="ml-auto"
                        onClick={() => toggleGrant.mutate(member.user_id)}
                      >
                        {granted
                          ? t("entityPage.reveals.revealed")
                          : t("entityPage.reveals.reveal")}
                      </Button>
                    </li>
                  );
                })}
            </ul>
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}
