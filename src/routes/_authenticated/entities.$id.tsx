import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { kindDef, RELATIONSHIP_TYPES, VISIBILITIES } from "@/lib/entity-kinds";
import {
  createRelationship,
  dataValue,
  deleteEntity,
  deleteRelationship,
  getEntity,
  grantKnowledge,
  listEntities,
  listEntityRevisions,
  listGrants,
  listRelationships,
  revokeKnowledge,
  snapshotEntity,
  updateEntity,
  withDataValue,
  type EntityRow,
} from "@/lib/lore";
import { getCampaign, listCampaignCharacters, listMembers } from "@/lib/api";
import { useSession } from "@/hooks/use-session";
import { FileDropzone } from "@/components/ui/FileDropzone";
import { portraitInitials, portraitUrl, removePortrait, uploadPortrait } from "@/lib/portrait";

export const Route = createFileRoute("/_authenticated/entities/$id")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Lore entry — Universal Character Forge" },
      {
        name: "description",
        content: "Edit a campaign lore entry: description, secrets, relationships and reveals.",
      },
      { property: "og:title", content: "Lore entry — Universal Character Forge" },
      { property: "og:description", content: "Campaign world and story record." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EntityPage,
});

function EntityPage() {
  const { id } = Route.useParams();
  const { user } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const entity = useQuery({ queryKey: ["entity", id], queryFn: () => getEntity(id) });
  const campaignId = entity.data?.campaign_id;
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
    queryKey: ["entity-photo", entityImagePath],
    queryFn: () => portraitUrl(entityImagePath),
    enabled: !!entityImagePath,
  });

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
      toast.success("Photo updated.");
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

  const [form, setForm] = useState<EntityRow | null>(null);
  useEffect(() => {
    if (entity.data) setForm(entity.data);
  }, [entity.data]);

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
      setForm(row);
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
        gm_notes: (snapshot["gm_notes"] ?? null) as string | null,
        status: String(snapshot["status"] ?? ""),
        visibility: String(snapshot["visibility"] ?? ""),
        tags: (snapshot["tags"] ?? []) as string[],
        data: (snapshot["data"] ?? {}) as never,
      }),
    onSuccess: async (row) => {
      setForm(row);
      toast.success("Version restored");
      await queryClient.invalidateQueries({ queryKey: ["entity", id] });
      await queryClient.invalidateQueries({ queryKey: ["lore-entities", row.campaign_id] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: () => deleteEntity(id),
    onSuccess: async () => {
      toast.success("Entry deleted");
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["lore-relationships", campaignId] }),
    onError: (error: Error) => toast.error(error.message),
  });

  const toggleGrant = useMutation({
    mutationFn: async (userId: string) => {
      const existing = (grants.data ?? []).find((g) => g.user_id === userId);
      if (existing) await revokeKnowledge(existing.id);
      else await grantKnowledge({ campaign_id: campaignId!, entity_id: id, user_id: userId });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["lore-grants", id] }),
    onError: (error: Error) => toast.error(error.message),
  });

  const nameOf = (entityId: string) =>
    (siblings.data ?? []).find((row) => row.id === entityId)?.name ?? "Unknown";

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
      <PageHeader
        title={form.name}
        description={`${def.label} · ${campaign.data?.name ?? "Campaign"}`}
        actions={
          <div className="flex items-center gap-2">
            {campaignId ? (
              <Button variant="outline" asChild>
                <Link to="/campaigns/$id" params={{ id: campaignId }}>
                  <ArrowLeft className="mr-2 size-4" /> Campaign
                </Link>
              </Button>
            ) : null}
            {isGm ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive">
                    <Trash2 className="mr-2 size-4" /> Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this entry?</AlertDialogTitle>
                    <AlertDialogDescription>
                      The entry, its relationships and its revision history are removed for
                      everyone in this campaign. This cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => remove.mutate()}>Delete</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : null}
          </div>
        }
      />

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="links">Relationships</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          {isGm ? <TabsTrigger value="reveals">Reveals</TabsTrigger> : null}
        </TabsList>

        <TabsContent value="overview" className="space-y-4 pt-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="entity-name">Name</Label>
              <Input
                id="entity-name"
                value={form.name}
                disabled={!canEdit}
                onChange={(event) => patch({ name: event.target.value })}
                onBlur={() => commit({ name: form.name })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="entity-status">Status</Label>
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
                      {status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {isGm ? (
              <div className="space-y-2">
                <Label htmlFor="entity-visibility">Visibility</Label>
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
              <Label htmlFor="entity-tags">Tags</Label>
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
              <Label>Image</Label>
              {entityImagePath ? (
                <div className="flex items-start gap-3">
                  {photoUrl.data ? (
                    <img loading="lazy" decoding="async"
                      src={photoUrl.data}
                      alt={`${form.name} image`}
                      onError={() => setOwnImageBroken(true)}
                      className="h-32 w-32 rounded-lg border object-cover"
                    />
                  ) : (
                    <Skeleton className="h-32 w-32 rounded-lg" />
                  )}
                  {canEdit ? (
                    <div className="space-y-2">
                      <FileDropzone
                        compact
                        accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
                        label="Drop a new image, or click to browse"
                        loading={uploadPhoto.isPending}
                        loadingLabel="Uploading image…"
                        onFiles={(files) => {
                          const file = files[0];
                          if (file) uploadPhoto.mutate(file);
                        }}
                      />
                      {form.image_url ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removePhoto.mutate(form.image_url!)}
                          disabled={removePhoto.isPending}
                        >
                          <Trash2 className="mr-2 size-4" /> Remove image
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : canEdit ? (
                <FileDropzone
                  accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
                  label={`Drop an image of ${form.name || "this entry"}, or click to browse`}
                  hint="PNG, JPEG, WebP, GIF or AVIF up to 5 MB"
                  loading={uploadPhoto.isPending}
                  loadingLabel="Uploading image…"
                  onFiles={(files) => {
                    const file = files[0];
                    if (file) uploadPhoto.mutate(file);
                  }}
                />
              ) : (
                <div className="flex h-32 w-32 items-center justify-center rounded-lg border bg-muted text-2xl font-semibold text-muted-foreground">
                  {portraitInitials(form.name)}
                </div>
              )}
              {!ownImagePath && inheritedPortrait ? (
                <p className="text-muted-foreground text-xs">
                  Showing the linked character sheet portrait. Drop an image to override it.
                </p>
              ) : null}
            </div>
            {form.kind === "NPC" ? (
              <div className="space-y-2">
                <Label htmlFor="entity-sheet">Character sheet (optional)</Label>
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
                    <SelectValue placeholder="No linked sheet" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No linked sheet</SelectItem>
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
                    >
                      <ExternalLink className="mr-2 size-4" /> Open character sheet
                    </Link>
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="entity-summary">Summary</Label>
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
            <Label htmlFor="entity-player">Player-facing description</Label>
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
              <Label htmlFor="entity-gm">GM notes</Label>
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
                    {field.label}
                    {field.gm ? (
                      <Badge variant="outline" className="ml-2">
                        GM
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
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        {(field.options ?? []).map((option) => (
                          <SelectItem key={option} value={option}>
                            {option}
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
                      placeholder={field.type === "list" ? "One per line" : undefined}
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
                <Label htmlFor="rel-type">Relationship</Label>
                <Select value={relType} onValueChange={setRelType}>
                  <SelectTrigger id="rel-type" className="w-56">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RELATIONSHIP_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type.replaceAll("_", " ").toLowerCase()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="rel-target">Target</Label>
                <Select value={relTarget} onValueChange={setRelTarget}>
                  <SelectTrigger id="rel-target" className="w-64">
                    <SelectValue placeholder="Pick an entry" />
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
                <Plus className="mr-2 size-4" /> Link
              </Button>
            </div>
          ) : null}

          {links.length === 0 ? (
            <p className="text-muted-foreground text-sm">No relationships yet.</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {links.map((row) => {
                const outgoing = row.source_id === id;
                const other = outgoing ? row.target_id : row.source_id;
                return (
                  <li key={row.id} className="flex items-center gap-3 p-3">
                    <span className="text-muted-foreground text-xs uppercase">
                      {outgoing ? "→" : "←"} {row.rel_type.replaceAll("_", " ").toLowerCase()}
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
                        aria-label="Remove relationship"
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
            <h2 className="text-sm font-semibold">Mentions</h2>
            {mentions.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No other entry mentions “{form.name}” in its text.
              </p>
            ) : (
              <ul className="divide-y rounded-lg border">
                {mentions.map((row) => (
                  <li key={row.id} className="flex items-center gap-3 p-3">
                    <span className="text-muted-foreground text-xs uppercase">
                      {kindDef(row.kind).label}
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
          <p className="text-muted-foreground text-sm">
            Each save stores the previous version. The 30 most recent are kept.
          </p>
          {revisions.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : (revisions.data ?? []).length === 0 ? (
            <p className="text-muted-foreground text-sm">No earlier versions yet.</p>
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
                        {new Date(row.created_at).toLocaleString()}
                        {row.label ? ` · ${row.label}` : ""}
                      </p>
                    </div>
                    {canEdit ? (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" size="sm" className="ml-auto">
                            Restore
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Restore this version?</AlertDialogTitle>
                            <AlertDialogDescription>
                              The current text is replaced by this saved version. The current
                              version is kept in history.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => restore.mutate(snapshot)}>
                              Restore
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
            <p className="text-muted-foreground text-sm">
              With visibility set to “Selected players”, only the players you pick below can see
              this entry.
            </p>
            <ul className="divide-y rounded-lg border">
              {(members.data ?? []).map((member) => {
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
                      {granted ? "Revealed" : "Reveal"}
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
