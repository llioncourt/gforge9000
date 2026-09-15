import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { FileDropzone } from "@/components/ui/FileDropzone";
import { Tabs, TabsContent, ScrollableTabsList, TabsTrigger } from "@/components/ui/tabs";
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
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  addNote,
  deleteNote,
  getCampaign,
  listCampaignCharacters,
  listCharacters,
  listEntriesForCharacters,
  listMembers,
  
  removeMember,
  transferCampaignGm,
  transferCharacterOwner,
  listNotes,
  setCharacterCampaign,
  toCharacterRecord,
  toEntry,
  updateCampaign,
  updateCharacter,
  createCharacter,
  duplicateCharacter,
} from "@/lib/api";
import { listLibrary } from "@/lib/api";
import { allowedPacksOf } from "@/lib/packs";
import { buildSheet } from "@/rules";
import { useSession } from "@/hooks/use-session";
import { CardPortraitBg } from "@/components/character/card-portrait-bg";
import { UserAvatar } from "@/components/app/user-avatar";

import { CampaignIntroExperience } from "@/components/campaign/intro-panel";
import { CampaignCoverBg } from "@/components/campaign/campaign-cover-bg";
import {
  CAMPAIGN_COVER_SETTING,
  removeCampaignCoverFile,
  uploadCampaignCover,
} from "@/lib/campaign-cover";

// Heavy campaign tabs load on demand — the campaign page ships a much
// smaller first bundle and each panel is fetched only when its tab opens.
// After a new deploy the old chunk filenames disappear, so an open tab can
// fail to fetch a panel. Retry once, then reload the page to pick up the
// fresh asset manifest (guarded so we never loop).
function lazyPanel<
  K extends string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  T extends Record<K, React.ComponentType<any>>,
>(load: () => Promise<T>, name: K) {

  return lazy(async () => {
    try {
      return { default: (await load())[name] };
    } catch (err) {
      try {
        return { default: (await load())[name] };
      } catch {
        const key = `chunk-reload:${name}`;
        if (typeof window !== "undefined" && !sessionStorage.getItem(key)) {
          sessionStorage.setItem(key, "1");
          window.location.reload();
          await new Promise(() => {});
        }
        throw err;
      }
    }
  });
}


const LorePanel = lazyPanel(() => import("@/components/lore/lore-panel"), "LorePanel");
const StoryPanel = lazyPanel(() => import("@/components/lore/story-panel"), "StoryPanel");
const GraphPanel = lazyPanel(() => import("@/components/lore/graph-panel"), "GraphPanel");
const PlayersPanel = lazyPanel(() => import("@/components/lore/players-panel"), "PlayersPanel");
const SessionsPanel = lazyPanel(() => import("@/components/lore/sessions-panel"), "SessionsPanel");
const TimelinePanel = lazyPanel(() => import("@/components/lore/timeline-panel"), "TimelinePanel");
const AssetsPanel = lazyPanel(() => import("@/components/lore/assets-panel"), "AssetsPanel");
const BattlePanel = lazyPanel(() => import("@/components/battle/battle-panel"), "BattlePanel");
const RollsPanel = lazyPanel(() => import("@/components/campaign/rolls-panel"), "RollsPanel");
const MediaPanel = lazyPanel(() => import("@/components/campaign/media-panel"), "MediaPanel");



function PanelFallback() {
  return <Skeleton className="h-64 w-full rounded-lg" />;
}

export const CAMPAIGN_TABS = [
  "media",
  "roster",
  "lore",
  "story",
  "graph",
  "reveals",
  "sessions",
  "timeline",
  "battle",
  "library",
  "rolls",
  "notes",
  "members",
  "rules",
] as const;
export type CampaignTab = (typeof CAMPAIGN_TABS)[number];

export const Route = createFileRoute("/_authenticated/campaigns/$id")({
  staticData: { sitemap: false },
  validateSearch: (search: Record<string, unknown>): { tab?: CampaignTab } => {
    const tab = search["tab"];
    return typeof tab === "string" && (CAMPAIGN_TABS as readonly string[]).includes(tab)
      ? { tab: tab as CampaignTab }
      : {};
  },
  head: ({ params }) => {
    const title = `Campaign ${params.id.slice(0, 8)} — Universal Character Forge`;
    const description =
      "Roster, GM tools, shared notes and house rules for this campaign.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { name: "robots", content: "noindex" },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
      ],
    };
  },

  component: CampaignPage,
});

function CampaignPage() {
  const { id } = Route.useParams();
  const { tab: tabParam } = Route.useSearch();
  const { user } = useSession();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const campaign = useQuery({ queryKey: ["campaign", id], queryFn: () => getCampaign(id) });

  useEffect(() => {
    const name = campaign.data?.name;
    if (name) document.title = `${name} — Universal Character Forge`;
  }, [campaign.data?.name]);

  const roster = useQuery({
    queryKey: ["campaign-characters", id],
    queryFn: () => listCampaignCharacters(id),
  });
  const members = useQuery({ queryKey: ["members", id], queryFn: () => listMembers(id) });
  const notes = useQuery({ queryKey: ["notes", id], queryFn: () => listNotes(id) });
  const mine = useQuery({ queryKey: ["characters"], queryFn: listCharacters });
  const entries = useQuery({
    queryKey: ["campaign-entries", id, roster.data?.map((c) => c.id).join(",")],
    queryFn: () => listEntriesForCharacters((roster.data ?? []).map((c) => c.id)),
    enabled: (roster.data?.length ?? 0) > 0,
  });

  const library = useQuery({ queryKey: ["library"], queryFn: listLibrary });
  const knownPacks = useMemo(() => {
    const set = new Set<string>();
    for (const row of library.data ?? []) if (row.pack) set.add(row.pack);
    return [...set];
  }, [library.data]);

  const isGm = campaign.data?.gm_id === user?.id;
  const settings = (campaign.data?.settings ?? {}) as Record<string, unknown>;

  const sheets = useMemo(() => {
    const byChar = new Map<string, ReturnType<typeof buildSheet>>();
    for (const c of roster.data ?? []) {
      const rows = (entries.data ?? []).filter((e) => e.character_id === c.id).map(toEntry);
      byChar.set(c.id, buildSheet(toCharacterRecord(c), rows));
    }
    return byChar;
  }, [roster.data, entries.data]);

  const createNpc = useMutation({
    mutationFn: () =>
      createCharacter({
        name: "New NPC",
        campaign_id: id,
        is_npc: true,
        approved: true,
        point_budget: Number((campaign.data?.settings as Record<string, unknown>)?.["point_limit"] ?? 150),
      } as never),
    onSuccess: (row) => {
      queryClient.invalidateQueries({ queryKey: ["campaign-characters", id] });
      toast.success("NPC created.");
      navigate({ to: "/characters/$id", params: { id: row.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cloneCharacter = useMutation({
    mutationFn: (cid: string) => duplicateCharacter(cid),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign-characters", id] });
      toast.success("Copy created.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const transferGm = useMutation({
    mutationFn: (newGmId: string) => transferCampaignGm(id, newGmId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign", id] });
      queryClient.invalidateQueries({ queryKey: ["members", id] });
      toast.success("GM role transferred.");
    },
    onError: (e: Error) => toast.error(e.message),
  });


  const removeMemberMut = useMutation({
    mutationFn: (userId: string) => removeMember(id, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["members", id] });
      toast.success("Member removed from the campaign.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const approve = useMutation({
    mutationFn: ({ cid, value }: { cid: string; value: boolean }) =>
      updateCharacter(cid, { approved: value }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["campaign-characters", id] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const assignPlayer = useMutation({
    mutationFn: ({ cid, name }: { cid: string; name: string | null }) =>
      updateCharacter(cid, { player_name: name }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["campaign-characters", id] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const transferOwner = useMutation({
    mutationFn: ({ cid, userId }: { cid: string; userId: string }) =>
      transferCharacterOwner(cid, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign-characters", id] });
      queryClient.invalidateQueries({ queryKey: ["characters"] });
      toast.success("Character ownership transferred.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const attach = useMutation({
    mutationFn: (cid: string) => setCharacterCampaign(cid, id),
    onSuccess: () => {
      queryClient.invalidateQueries();
      toast.success("Character submitted to the campaign.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeFromCampaign = useMutation({
    mutationFn: (cid: string) => setCharacterCampaign(cid, null),
    onSuccess: () => {
      queryClient.invalidateQueries();
      toast.success("Character removed from the campaign.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveSettings = useMutation({
    mutationFn: (patch: Record<string, unknown>) =>
      updateCampaign(id, { settings: { ...settings, ...patch } as never }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign", id] });
      toast.success("Campaign settings saved.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [premiseValue, setPremiseValue] = useState("");

  const renameCampaign = useMutation({
    mutationFn: ({ name, description }: { name: string; description: string | null }) =>
      updateCampaign(id, { name, description }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign", id] });
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      setRenameOpen(false);
      toast.success("Campaign updated.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [noteFilter, setNoteFilter] = useState("all");
  const [noteTitle, setNoteTitle] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [noteKind, setNoteKind] = useState("note");
  const [gmOnly, setGmOnly] = useState(false);

  const visibleNotes = useMemo(
    () => (notes.data ?? []).filter((n) => noteFilter === "all" || n.kind === noteFilter),
    [notes.data, noteFilter],
  );

  const createNote = useMutation({
    mutationFn: () =>
      addNote({
        campaign_id: id,
        title: noteTitle,
        body: noteBody,
        kind: noteKind,
        gm_only: gmOnly,
      } as never),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notes", id] });
      setNoteTitle("");
      setNoteBody("");
      toast.success("Entry added.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeNote = useMutation({
    mutationFn: deleteNote,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notes", id] }),
  });

  if (campaign.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 w-full rounded-lg" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={
          <span className="inline-flex items-center gap-2">
            {campaign.data?.name ?? "Campaign"}
            {isGm ? (
              <button
                type="button"
                aria-label="Rename campaign"
                className="text-muted-foreground transition-colors hover:text-foreground"
                onClick={() => {
                  setRenameValue(campaign.data?.name ?? "");
                  setPremiseValue(campaign.data?.description ?? "");
                  setRenameOpen(true);
                }}
              >
                <Pencil className="h-4 w-4" />
              </button>
            ) : null}
          </span>
        }
        description={campaign.data?.description ?? undefined}
        actions={
          <>
          {isGm ? (
            <Button onClick={() => createNpc.mutate()} disabled={createNpc.isPending}>
              <Plus className="mr-2 h-4 w-4" /> New NPC
            </Button>
          ) : null}
          <Button
            variant="outline"
            onClick={() => {
              void navigator.clipboard.writeText(campaign.data?.invite_code ?? "");
              toast.success("Invite code copied.");
            }}
          >
            <Copy className="mr-2 h-4 w-4" />
            <span className="font-mono">{campaign.data?.invite_code}</span>
          </Button>
          </>

        }
      />

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit campaign</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const name = renameValue.trim();
              if (!name) return;
              renameCampaign.mutate({
                name,
                description: premiseValue.trim() || null,
              });
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="campaign-name">Campaign name</Label>
              <Input
                id="campaign-name"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="campaign-premise">Premise</Label>
              <Textarea
                id="campaign-premise"
                rows={4}
                placeholder="What is this campaign about?"
                value={premiseValue}
                onChange={(e) => setPremiseValue(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={renameCampaign.isPending || !renameValue.trim()}>
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <CampaignIntroExperience campaignId={id} isGm={isGm} display="gate" />

      <Tabs
        value={tabParam ?? "roster"}
        onValueChange={(v) =>
          navigate({
            to: "/campaigns/$id",
            params: { id },
            search: { tab: v as CampaignTab },
            replace: true,
          })
        }
      >
        <ScrollableTabsList>
          <TabsTrigger value="media">Media</TabsTrigger>
          <TabsTrigger value="roster">Roster</TabsTrigger>
          <TabsTrigger value="lore">World &amp; lore</TabsTrigger>
          <TabsTrigger value="story">Story</TabsTrigger>
          <TabsTrigger value="graph">Graph</TabsTrigger>
          <TabsTrigger value="reveals">Reveals</TabsTrigger>
          <TabsTrigger value="sessions">Sessions</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="battle">Battle grid</TabsTrigger>
          <TabsTrigger value="library">Library</TabsTrigger>
          <TabsTrigger value="rolls">Rolls</TabsTrigger>

          <TabsTrigger value="notes">Notes &amp; handouts</TabsTrigger>
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="rules">House rules</TabsTrigger>
        </ScrollableTabsList>

        <TabsContent value="media" className="mt-6">
          <Suspense fallback={<PanelFallback />}>
            <MediaPanel campaignId={id} isGm={isGm} />
          </Suspense>
        </TabsContent>

        <TabsContent value="roster" className="mt-6 space-y-6">
          {roster.isLoading ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-[220px] w-full rounded-lg" />
              ))}
            </div>
          ) : (roster.data?.length ?? 0) === 0 ? (
            <div className="panel p-8 text-center text-sm text-muted-foreground">
              No characters submitted yet. Players attach a character below.
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {roster.data?.map((c) => {
                const sheet = sheets.get(c.id);
                const playerMember = (members.data ?? []).find(
                  (m) => m.display_name === c.player_name,
                );
                return (
                  <div key={c.id} className="panel relative overflow-hidden p-4">
                    <CardPortraitBg path={c.portrait_path} />
                    <div className="relative">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <Link
                          to="/characters/$id"
                          params={{ id: c.id }}
                          className="font-display font-semibold hover:underline"
                        >
                          {c.name}
                        </Link>
                        {isGm ? (
                          (() => {
                            const names = (members.data ?? []).map((m) => m.display_name);
                            const val = c.player_name ?? (c.is_npc ? "__npc__" : "__unassigned__");
                            const orphan = c.player_name && !names.includes(c.player_name) && c.player_name !== "NPC";
                            return (
                              <div className="mt-0.5 flex items-center gap-2">
                              {c.player_name ? (
                                <UserAvatar
                                  name={c.player_name}
                                  avatarPath={playerMember?.avatar_url}
                                />
                              ) : null}
                              <Select
                                value={val}
                                onValueChange={(v) =>
                                  assignPlayer.mutate({
                                    cid: c.id,
                                    name: v === "__unassigned__" || v === "__npc__" ? null : v,
                                  })
                                }
                              >
                                <SelectTrigger className="mt-0.5 h-7 w-full max-w-[180px] text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__unassigned__">Unassigned</SelectItem>
                                  {c.is_npc && <SelectItem value="__npc__">NPC</SelectItem>}
                                  {members.data?.map((m) => (
                                    <SelectItem key={m.user_id} value={m.display_name}>
                                      {m.display_name}
                                    </SelectItem>
                                  ))}
                                  {orphan && (
                                    <SelectItem value={c.player_name!}>{c.player_name}</SelectItem>
                                  )}
                                </SelectContent>
                              </Select>
                              </div>
                            );
                          })()
                        ) : (
                          <p className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                            {c.player_name ? (
                              <UserAvatar
                                name={c.player_name}
                                avatarPath={playerMember?.avatar_url}
                              />
                            ) : null}
                            {c.player_name || (c.is_npc ? "NPC" : "Player character")}
                          </p>
                        )}
                      </div>
                      <Badge variant={c.approved ? "default" : "outline"}>
                        {c.approved ? "Approved" : "Pending"}
                      </Badge>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
                      <Mini label="HP" value={`${c.current_hp ?? sheet?.stats.hp ?? 0}/${sheet?.stats.hp ?? 0}`} />
                      <Mini label="FP" value={`${c.current_fp ?? sheet?.stats.fp ?? 0}/${sheet?.stats.fp ?? 0}`} />
                      <Mini label="Move" value={sheet?.encumbrance.effectiveMove ?? 0} />
                      <Mini label="Dodge" value={sheet?.encumbrance.effectiveDodge ?? 0} />
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
                      <Mini label="ST" value={sheet?.stats.st ?? 0} />
                      <Mini label="DX" value={sheet?.stats.dx ?? 0} />
                      <Mini label="IQ" value={sheet?.stats.iq ?? 0} />
                      <Mini label="HT" value={sheet?.stats.ht ?? 0} />
                    </div>

                    <p className="mt-3 text-xs text-muted-foreground">
                      Points {sheet?.points.total ?? 0} / {c.point_budget} · Load{" "}
                      {sheet?.encumbrance.label ?? "—"} · DR{" "}
                      {Object.entries(sheet?.dr ?? {})
                        .map(([k, v]) => `${k} ${v}`)
                        .join(", ") || "none"}
                    </p>
                    {c.conditions.length ? (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {c.conditions.map((cond) => (
                          <Badge key={cond} variant="outline" className="text-[10px]">
                            {cond}
                          </Badge>
                        ))}
                      </div>
                    ) : null}

                    {isGm || c.owner_id === user?.id ? (
                      <div className="mt-3 flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Owner</span>
                        <Select
                          value={c.owner_id}
                          onValueChange={(v) => {
                            if (v !== c.owner_id) transferOwner.mutate({ cid: c.id, userId: v });
                          }}
                          disabled={transferOwner.isPending}
                        >
                          <SelectTrigger className="h-7 w-full max-w-[180px] text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(members.data ?? []).some((m) => m.user_id === c.owner_id) ? null : (
                              <SelectItem value={c.owner_id}>Current owner</SelectItem>
                            )}
                            {members.data?.map((m) => (
                              <SelectItem key={m.user_id} value={m.user_id}>
                                {m.display_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : null}



                    {isGm ? (
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant={c.approved ? "outline" : "default"}
                          onClick={() => approve.mutate({ cid: c.id, value: !c.approved })}
                        >
                          <Check className="mr-1 h-3.5 w-3.5" />
                          {c.approved ? "Revoke" : "Approve"}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => cloneCharacter.mutate(c.id)}
                          disabled={cloneCharacter.isPending}
                        >
                          Duplicate
                        </Button>
                        <Button asChild size="sm" variant="ghost">
                          <Link to="/characters/$id" params={{ id: c.id }}>
                            Open sheet
                          </Link>
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive hover:text-destructive"
                              disabled={removeFromCampaign.isPending}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Remove from campaign?</AlertDialogTitle>
                              <AlertDialogDescription>
                                {c.name} will be detached from this campaign but kept on the owner's account.
                                {c.is_npc ? " This NPC will no longer appear in the roster." : ""}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => removeFromCampaign.mutate(c.id)}
                              >
                                Remove
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="panel p-4">
            <h3 className="font-display text-sm font-semibold">Submit one of your characters</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {(mine.data ?? [])
                .filter((c) => c.campaign_id !== id)
                .map((c) => (
                  <Button key={c.id} size="sm" variant="outline" onClick={() => attach.mutate(c.id)}>
                    <Plus className="mr-1 h-3.5 w-3.5" /> {c.name}
                  </Button>
                ))}
              {(mine.data ?? []).filter((c) => c.campaign_id !== id).length === 0 ? (
                <p className="text-sm text-muted-foreground">All your characters are submitted.</p>
              ) : null}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="lore" className="mt-6">
          <Suspense fallback={<PanelFallback />}>
            <LorePanel campaignId={id} isGm={isGm} />
          </Suspense>
        </TabsContent>

        <TabsContent value="story" className="mt-6">
          <Suspense fallback={<PanelFallback />}>
            <StoryPanel campaignId={id} isGm={isGm} />
          </Suspense>
        </TabsContent>

        <TabsContent value="graph" className="mt-6">
          <Suspense fallback={<PanelFallback />}>
            <GraphPanel campaignId={id} />
          </Suspense>
        </TabsContent>

        <TabsContent value="reveals" className="mt-6">
          <Suspense fallback={<PanelFallback />}>
            <PlayersPanel campaignId={id} isGm={isGm} />
          </Suspense>
        </TabsContent>

        <TabsContent value="sessions" className="mt-6">
          <Suspense fallback={<PanelFallback />}>
            <SessionsPanel campaignId={id} isGm={isGm} />
          </Suspense>
        </TabsContent>

        <TabsContent value="timeline" className="mt-6">
          <Suspense fallback={<PanelFallback />}>
            <TimelinePanel campaignId={id} isGm={isGm} />
          </Suspense>
        </TabsContent>

        <TabsContent value="battle" className="mt-6">
          <Suspense fallback={<PanelFallback />}>
            <BattlePanel campaignId={id} isGm={isGm} />
          </Suspense>
        </TabsContent>

        <TabsContent value="library" className="mt-6">
          <Suspense fallback={<PanelFallback />}>
            <AssetsPanel campaignId={id} isGm={isGm} />
          </Suspense>
        </TabsContent>

        <TabsContent value="rolls" className="mt-6">
          <Suspense fallback={<PanelFallback />}>
            <RollsPanel campaignId={id} isGm={isGm} />
          </Suspense>
        </TabsContent>

        <TabsContent value="notes" className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
          <div className="space-y-3">
            <div className="w-full sm:w-60">
              <Select value={noteFilter} onValueChange={setNoteFilter}>
                <SelectTrigger aria-label="Filter entries">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All entries</SelectItem>
                  <SelectItem value="note">Notes</SelectItem>
                  <SelectItem value="handout">Handouts</SelectItem>
                  <SelectItem value="session">Session log</SelectItem>
                  <SelectItem value="npc">NPCs</SelectItem>
                  <SelectItem value="party-inventory">Party inventory</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {notes.isLoading ? (
              [0, 1].map((i) => <Skeleton key={i} className="h-24 w-full rounded-lg" />)
            ) : visibleNotes.length ? (
              visibleNotes.map((n) => (
                <article key={n.id} className="panel p-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-medium">{n.title}</h3>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">
                        {n.kind}
                      </Badge>
                      {n.gm_only ? <Badge className="text-[10px]">GM only</Badge> : null}
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => removeNote.mutate(n.id)}
                        aria-label="Delete note"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{n.body}</p>
                </article>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No entries here yet.</p>
            )}
          </div>

          <div className="panel h-fit space-y-3 p-4">
            <h3 className="font-display text-sm font-semibold">Add an entry</h3>
            <Input
              placeholder="Title"
              value={noteTitle}
              onChange={(e) => setNoteTitle(e.target.value)}
            />
            <Textarea
              rows={5}
              placeholder="Body"
              value={noteBody}
              onChange={(e) => setNoteBody(e.target.value)}
            />
            <Select value={noteKind} onValueChange={setNoteKind}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="note">Note</SelectItem>
                <SelectItem value="handout">Handout</SelectItem>
                <SelectItem value="session">Session log</SelectItem>
                <SelectItem value="npc">NPC</SelectItem>
                <SelectItem value="party-inventory">Party inventory</SelectItem>
              </SelectContent>
            </Select>
            {isGm ? (
              <div className="flex items-center justify-between">
                <Label htmlFor="gm-only">GM only</Label>
                <Switch id="gm-only" checked={gmOnly} onCheckedChange={setGmOnly} />
              </div>
            ) : null}
            <Button
              className="w-full"
              onClick={() => createNote.mutate()}
              disabled={!noteTitle || createNote.isPending}
            >
              Add entry
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="members" className="mt-6">
          <div className="panel divide-y divide-border">
            {(members.data ?? []).map((m) => (
              <div key={m.user_id} className="flex items-center justify-between gap-2 p-4">
                <span>{m.display_name}</span>
                <div className="flex items-center gap-2">
                  {isGm && m.user_id !== user?.id && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="outline" disabled={transferGm.isPending}>
                          Make GM
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Transfer the GM role?</AlertDialogTitle>
                          <AlertDialogDescription>
                            {m.display_name} becomes the game master of this campaign and you
                            become a regular player. Only the new GM can transfer it back.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => transferGm.mutate(m.user_id)}>
                            Transfer
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                  {isGm && m.user_id !== user?.id && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Remove ${m.display_name} from the campaign`}
                          disabled={removeMemberMut.isPending}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remove this member?</AlertDialogTitle>
                          <AlertDialogDescription>
                            {m.display_name} loses access to this campaign. Their characters stay in
                            their account and can be re-attached later.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => removeMemberMut.mutate(m.user_id)}>
                            Remove
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                  <Badge variant={m.role === "gm" ? "default" : "outline"}>{m.role}</Badge>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="rules" className="mt-6">
          <HouseRules
            campaignId={id}
            settings={settings}
            disabled={!isGm}
            knownPacks={knownPacks}
            onSave={(patch) => saveSettings.mutate(patch)}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-border bg-muted/30 px-2 py-1">
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="stat-value text-sm">{value}</p>
    </div>
  );
}

function HouseRules({
  campaignId,
  settings,
  disabled,
  knownPacks,
  onSave,
}: {
  campaignId: string;
  settings: Record<string, unknown>;
  disabled: boolean;
  knownPacks: string[];
  onSave: (patch: Record<string, unknown>) => void;
}) {
  const [pointLimit, setPointLimit] = useState(String(settings["point_limit"] ?? 150));
  const [disadvLimit, setDisadvLimit] = useState(String(settings["disadvantage_limit"] ?? -50));
  const [tl, setTl] = useState(String(settings["tech_level"] ?? 8));
  const [houseRules, setHouseRules] = useState(String(settings["house_rules"] ?? ""));
  const [packs, setPacks] = useState<string[]>(allowedPacksOf(settings));
  const [newPack, setNewPack] = useState("");
  const queryClient = useQueryClient();
  const coverPath =
    typeof settings[CAMPAIGN_COVER_SETTING] === "string"
      ? String(settings[CAMPAIGN_COVER_SETTING])
      : null;
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  useEffect(
    () => () => {
      if (coverPreview) URL.revokeObjectURL(coverPreview);
    },
    [coverPreview],
  );
  const cover = useMutation({
    mutationFn: async (file: File) => {
      const nextPath = await uploadCampaignCover(campaignId, file);
      try {
        await updateCampaign(campaignId, {
          settings: { ...settings, [CAMPAIGN_COVER_SETTING]: nextPath } as never,
        });
      } catch (error) {
        await removeCampaignCoverFile(nextPath).catch(() => undefined);
        throw error;
      }
      if (coverPath && coverPath !== nextPath) {
        await removeCampaignCoverFile(coverPath).catch(() => undefined);
      }
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["campaign", campaignId] }),
        queryClient.invalidateQueries({ queryKey: ["campaigns"] }),
      ]);
      setCoverPreview(null);
      toast.success("Campaign cover updated.");
    },
    onError: (error: Error) => {
      setCoverPreview(null);
      toast.error(error.message);
    },
  });
  const removeCover = useMutation({
    mutationFn: async () => {
      await updateCampaign(campaignId, {
        settings: { ...settings, [CAMPAIGN_COVER_SETTING]: null } as never,
      });
      if (coverPath) await removeCampaignCoverFile(coverPath).catch(() => undefined);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["campaign", campaignId] }),
        queryClient.invalidateQueries({ queryKey: ["campaigns"] }),
      ]);
      toast.success("Campaign cover removed.");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const packOptions = useMemo(
    () => Array.from(new Set([...knownPacks, ...packs])).sort((a, b) => a.localeCompare(b)),
    [knownPacks, packs],
  );
  const togglePack = (name: string, on: boolean) =>
    setPacks((prev) => (on ? [...new Set([...prev, name])] : prev.filter((p) => p !== name)));

  return (
    <div className="panel max-w-2xl space-y-4 p-6">
      <section className="space-y-3">
        <div>
          <Label>Campaign card cover</Label>
          <p className="mt-1 text-xs text-muted-foreground">
            This image appears behind the campaign card. Images are converted to AVIF.
          </p>
        </div>
        {coverPath || coverPreview ? (
          <div className="relative aspect-[16/7] overflow-hidden rounded-lg border border-border">
            <CampaignCoverBg path={coverPath} previewUrl={coverPreview} />
          </div>
        ) : null}
        {!disabled ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
            <FileDropzone
              compact
              accept="image/*,.heic,.heif,.tif,.tiff,.bmp"
              loading={cover.isPending}
              loadingLabel="Uploading cover…"
              className="min-h-20 flex-1"
              label={coverPath ? "Drop a replacement cover here, or click to browse" : "Drop a cover here, or click to browse"}
              hint="Any common image format, up to 25 MB."
              onFiles={(files) => {
                const file = files[0];
                if (!file) return;
                const preview = URL.createObjectURL(file);
                setCoverPreview((current) => {
                  if (current) URL.revokeObjectURL(current);
                  return preview;
                });
                cover.mutate(file);
              }}
            />
            {coverPath ? (
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-10 w-10 self-end sm:h-auto sm:w-10 sm:self-stretch"
                aria-label="Remove campaign cover"
                disabled={cover.isPending || removeCover.isPending}
                onClick={() => removeCover.mutate()}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
        ) : null}
      </section>
      <div className="border-t border-border" />
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label>Point limit</Label>
          <Input value={pointLimit} onChange={(e) => setPointLimit(e.target.value)} disabled={disabled} />
        </div>
        <div className="space-y-1.5">
          <Label>Disadvantage limit</Label>
          <Input value={disadvLimit} onChange={(e) => setDisadvLimit(e.target.value)} disabled={disabled} />
        </div>
        <div className="space-y-1.5">
          <Label>Tech level</Label>
          <Input value={tl} onChange={(e) => setTl(e.target.value)} disabled={disabled} />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Enabled content packs</Label>
        {packOptions.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No content packs found yet. Tag library entries with a pack name to manage them here.
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {packOptions.map((p) => (
              <label key={p} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={packs.includes(p)}
                  disabled={disabled}
                  onCheckedChange={(v) => togglePack(p, v === true)}
                  aria-label={`Enable pack ${p}`}
                />
                <span>{p}</span>
              </label>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <Input
            value={newPack}
            onChange={(e) => setNewPack(e.target.value)}
            disabled={disabled}
            placeholder="Add another pack name"
            aria-label="Add another pack name"
          />
          <Button
            type="button"
            variant="outline"
            disabled={disabled || !newPack.trim()}
            onClick={() => {
              togglePack(newPack.trim(), true);
              setNewPack("");
            }}
          >
            Add
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          With nothing enabled every pack is allowed. When at least one pack is enabled, library
          entries from other packs cannot be added to characters in this campaign. Entries with no
          pack are personal content and stay available.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label>House rules</Label>
        <Textarea
          rows={8}
          value={houseRules}
          onChange={(e) => setHouseRules(e.target.value)}
          disabled={disabled}
          placeholder="Table agreements, allowed content packs, campaign tone…"
        />
      </div>
      <Button
        disabled={disabled}
        onClick={() =>
          onSave({
            point_limit: Number(pointLimit) || 0,
            disadvantage_limit: Number(disadvLimit) || 0,
            tech_level: Number(tl) || 0,
            house_rules: houseRules,
            allowed_packs: packs.map((p) => p.trim()).filter(Boolean),
          })
        }
      >
        Save house rules
      </Button>
    </div>
  );
}
