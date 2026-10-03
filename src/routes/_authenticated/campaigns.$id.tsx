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
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { CampaignNav } from "@/components/campaign/campaign-nav";
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
import { listLibraryPackNames } from "@/lib/api";
import { allowedPacksOf } from "@/lib/packs";
import { buildSheet } from "@/rules";
import { CampaignRules } from "@/components/campaign/campaign-rules";
import { CAMPAIGN_RULESET_SETTING, rulesetFromSettings } from "@/rules/campaign-ruleset";
import { useSession } from "@/hooks/use-session";
import { CardPortraitBg } from "@/components/character/card-portrait-bg";
import { RosterPlayerCard } from "@/components/campaign/roster-player-card";
import { useT } from "@/i18n/hooks";
import { UserAvatar } from "@/components/app/user-avatar";
import { VisibilityBadge } from "@/components/lore/visibility-badge";

import { CampaignIntroExperience } from "@/components/campaign/intro-panel";
import { CampaignVideoStage } from "@/components/campaign/campaign-video-stage";
import { CampaignCoverBg } from "@/components/campaign/campaign-cover-bg";
import {
  CAMPAIGN_COVER_POSITION_SETTING,
  CAMPAIGN_COVER_SETTING,
  coverPositionFromSettings,
  removeCampaignCoverFile,
  uploadCampaignCover,
} from "@/lib/campaign-cover";
import { Slider } from "@/components/ui/slider";
import { metaText } from "@/i18n/meta";
import { SubmissionsPanel } from "@/components/campaign/submissions-panel";
import { setMemberRole } from "@/lib/campaign-submissions";

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
const AdaptationPanel = lazyPanel(
  () => import("@/components/adaptation/adaptation-panel"),
  "AdaptationPanel",
);

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
  "adapt",
  "notes",
  "members",
  "rules",
  "submissions",
] as const;
export type CampaignTab = (typeof CAMPAIGN_TABS)[number];
export type MediaSubTab = "cover" | "videos" | "soundtrack" | "sound-fx";

export const Route = createFileRoute("/_authenticated/campaigns/$id")({
  staticData: { sitemap: false },
  validateSearch: (
    search: Record<string, unknown>,
  ): { tab?: CampaignTab; item?: string; sub?: MediaSubTab } => {
    const tab = search["tab"];
    const item = search["item"];
    const sub = search["sub"];
    const out: { tab?: CampaignTab; item?: string; sub?: MediaSubTab } = {};
    if (typeof tab === "string" && (CAMPAIGN_TABS as readonly string[]).includes(tab))
      out.tab = tab as CampaignTab;
    if (typeof item === "string" && item) out.item = item;
    if (sub === "cover" || sub === "videos" || sub === "soundtrack" || sub === "sound-fx")
      out.sub = sub;
    return out;
  },
  head: ({ params }) => {
    const title = metaText("campaigns", "meta.detailTitle", { id: params.id.slice(0, 8) });
    const description = metaText("campaigns", "meta.detailDescription");
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
  const { t } = useT("campaigns");
  const { t: tc } = useT("common");
  const { t: ta } = useT("adaptation");
  const { id } = Route.useParams();
  const { tab: tabParam, item: itemParam, sub: subParam } = Route.useSearch();
  const { user } = useSession();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const campaign = useQuery({ queryKey: ["campaign", id], queryFn: () => getCampaign(id) });

  useEffect(() => {
    const name = campaign.data?.name;
    if (name) document.title = `${name} — Universal Character Forge`;
  }, [campaign.data?.name]);

  // Deep-link from global search: scroll to the exact item inside the tab and flash it.
  useEffect(() => {
    if (!itemParam) return;
    const wanted = itemParam;
    let attempts = 0;
    const timer = setInterval(() => {
      const el = document.querySelector(`[data-search-id="${CSS.escape(wanted)}"]`);
      attempts += 1;
      if (el instanceof HTMLElement) {
        clearInterval(timer);
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("ring-2", "ring-primary", "rounded-lg");
        window.setTimeout(() => el.classList.remove("ring-2", "ring-primary", "rounded-lg"), 2600);
        const next: { tab?: CampaignTab; sub?: MediaSubTab } = {};
        if (tabParam) next.tab = tabParam;
        if (subParam) next.sub = subParam;
        void navigate({ to: "/campaigns/$id", params: { id }, search: next, replace: true });
      } else if (attempts > 40) {
        clearInterval(timer);
      }
    }, 200);
    return () => clearInterval(timer);
  }, [itemParam, tabParam, subParam, id, navigate]);

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

  const libraryPacks = useQuery({ queryKey: ["library-packs"], queryFn: listLibraryPackNames });
  const knownPacks = useMemo(() => libraryPacks.data ?? [], [libraryPacks.data]);

  const isGm = campaign.data?.gm_id === user?.id;
  const isProducer = (members.data ?? []).some(
    (m) => m.user_id === user?.id && m.role === "producer",
  );
  const changeRole = useMutation({
    mutationFn: (v: { userId: string; role: "player" | "producer" }) =>
      setMemberRole(id, v.userId, v.role),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["members", id] }),
    onError: (e: Error) => toast.error(e.message),
  });
  const settings = (campaign.data?.settings ?? {}) as Record<string, unknown>;

  const campaignRuleset = useMemo(() => rulesetFromSettings(settings), [settings]);

  const sheets = useMemo(() => {
    const byChar = new Map<string, ReturnType<typeof buildSheet>>();
    for (const c of roster.data ?? []) {
      const rows = (entries.data ?? []).filter((e) => e.character_id === c.id).map(toEntry);
      byChar.set(c.id, buildSheet(toCharacterRecord(c), rows, campaignRuleset));
    }
    return byChar;
  }, [roster.data, entries.data, campaignRuleset]);

  const createNpc = useMutation({
    mutationFn: () =>
      createCharacter({
        name: "New NPC",
        campaign_id: id,
        is_npc: true,
        approved: true,
        point_budget: Number(
          (campaign.data?.settings as Record<string, unknown>)?.["point_limit"] ?? 150,
        ),
      } as never),
    onSuccess: (row) => {
      queryClient.invalidateQueries({ queryKey: ["campaign-characters", id] });
      toast.success(t("page.npcCreated"));
      navigate({
        to: "/characters/$id",
        params: { id: row.id },
        search: { from: `campaign:${id}:${tabParam ?? "roster"}` },
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cloneCharacter = useMutation({
    mutationFn: (cid: string) => duplicateCharacter(cid),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign-characters", id] });
      toast.success(t("page.copyCreated"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const transferGm = useMutation({
    mutationFn: (newGmId: string) => transferCampaignGm(id, newGmId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign", id] });
      queryClient.invalidateQueries({ queryKey: ["members", id] });
      toast.success(t("page.gmTransferred"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeMemberMut = useMutation({
    mutationFn: (userId: string) => removeMember(id, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["members", id] });
      toast.success(t("page.memberRemoved"));
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
      toast.success(t("page.ownershipTransferred"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const attach = useMutation({
    mutationFn: (cid: string) => setCharacterCampaign(cid, id),
    onSuccess: () => {
      queryClient.invalidateQueries();
      toast.success(t("page.characterSubmitted"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeFromCampaign = useMutation({
    mutationFn: (cid: string) => setCharacterCampaign(cid, null),
    onSuccess: () => {
      queryClient.invalidateQueries();
      toast.success(t("page.characterRemoved"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveSettings = useMutation({
    mutationFn: (patch: Record<string, unknown>) =>
      updateCampaign(id, { settings: { ...settings, ...patch } as never }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign", id] });
      toast.success(t("page.settingsSaved"));
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
      toast.success(t("page.campaignUpdated"));
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
      toast.success(t("notes.addEntry.added"));
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
            {campaign.data?.name ?? t("page.fallbackTitle")}
            {isGm ? (
              <button
                type="button"
                aria-label={t("page.renameAria")}
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
                <Plus className="mr-2 h-4 w-4" /> {t("page.newNpc")}
              </Button>
            ) : null}
            <Button
              variant="outline"
              onClick={() => {
                void navigator.clipboard.writeText(campaign.data?.invite_code ?? "");
                toast.success(t("page.inviteCopied"));
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
            <DialogTitle>{t("editDialog.title")}</DialogTitle>
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
              <Label htmlFor="campaign-name">{t("editDialog.nameLabel")}</Label>
              <Input
                id="campaign-name"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="campaign-premise">{t("editDialog.premiseLabel")}</Label>
              <Textarea
                id="campaign-premise"
                rows={4}
                placeholder={t("editDialog.premisePlaceholder")}
                value={premiseValue}
                onChange={(e) => setPremiseValue(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={renameCampaign.isPending || !renameValue.trim()}>
                {tc("actions.save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <CampaignIntroExperience campaignId={id} isGm={isGm} display="gate" />

      <CampaignVideoStage campaignId={id} isGm={isGm} />

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
        <CampaignNav
          value={tabParam ?? "roster"}
          isGm={isGm}
          isProducer={isProducer}
          adaptLabel={ta("tab")}
          onChange={(v) =>
            navigate({
              to: "/campaigns/$id",
              params: { id },
              search: { tab: v as CampaignTab },
              replace: true,
            })
          }
        />

        <TabsContent value="media" className="mt-6">
          <Suspense fallback={<PanelFallback />}>
            <MediaPanel
              campaignId={id}
              isGm={isGm}
              cover={<CampaignCover campaignId={id} settings={settings} disabled={!isGm} />}
              sub={subParam ?? null}
              focusId={itemParam ?? null}
            />
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
              {t("roster.empty")}
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
                            search={{ from: `campaign:${id}:${tabParam ?? "roster"}` }}
                            className="font-display font-semibold hover:underline"
                          >
                            {c.name}
                          </Link>
                          {isGm ? (
                            (() => {
                              const names = (members.data ?? []).map((m) => m.display_name);
                              const val =
                                c.player_name ?? (c.is_npc ? "__npc__" : "__unassigned__");
                              const orphan =
                                c.player_name &&
                                !names.includes(c.player_name) &&
                                c.player_name !== "NPC";
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
                                      <SelectItem value="__unassigned__">
                                        {t("roster.unassigned")}
                                      </SelectItem>
                                      {c.is_npc && (
                                        <SelectItem value="__npc__">{t("roster.npc")}</SelectItem>
                                      )}
                                      {members.data?.map((m) => (
                                        <SelectItem key={m.user_id} value={m.display_name}>
                                          {m.display_name}
                                        </SelectItem>
                                      ))}
                                      {orphan && (
                                        <SelectItem value={c.player_name!}>
                                          {c.player_name}
                                        </SelectItem>
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
                              {c.player_name ||
                                (c.is_npc ? t("roster.npc") : t("roster.playerCharacter"))}
                            </p>
                          )}
                        </div>
                        <Badge variant={c.approved ? "default" : "outline"}>
                          {c.approved ? t("roster.approved") : t("roster.pending")}
                        </Badge>
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
                        <Mini
                          label={t("roster.stats.hp")}
                          value={`${c.current_hp ?? sheet?.stats.hp ?? 0}/${sheet?.stats.hp ?? 0}`}
                        />
                        <Mini
                          label={t("roster.stats.fp")}
                          value={`${c.current_fp ?? sheet?.stats.fp ?? 0}/${sheet?.stats.fp ?? 0}`}
                        />
                        <Mini
                          label={t("roster.stats.move")}
                          value={sheet?.encumbrance.effectiveMove ?? 0}
                        />
                        <Mini
                          label={t("roster.stats.dodge")}
                          value={sheet?.encumbrance.effectiveDodge ?? 0}
                        />
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
                        <Mini label={t("roster.stats.st")} value={sheet?.stats.st ?? 0} />
                        <Mini label={t("roster.stats.dx")} value={sheet?.stats.dx ?? 0} />
                        <Mini label={t("roster.stats.iq")} value={sheet?.stats.iq ?? 0} />
                        <Mini label={t("roster.stats.ht")} value={sheet?.stats.ht ?? 0} />
                      </div>

                      <p className="mt-3 text-xs text-muted-foreground">
                        {t("roster.pointsSummary", {
                          total: sheet?.points.total ?? 0,
                          budget: c.point_budget,
                          load: sheet?.encumbrance.label ?? "—",
                          dr:
                            Object.entries(sheet?.dr ?? {})
                              .map(([k, v]) => `${k} ${v}`)
                              .join(", ") || t("roster.drNone"),
                        })}
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
                          <span className="text-xs text-muted-foreground">{t("roster.owner")}</span>
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
                                <SelectItem value={c.owner_id}>
                                  {t("roster.currentOwner")}
                                </SelectItem>
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
                            {c.approved ? t("roster.revoke") : t("roster.approve")}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => cloneCharacter.mutate(c.id)}
                            disabled={cloneCharacter.isPending}
                          >
                            {t("roster.duplicate")}
                          </Button>
                          <Button asChild size="sm" variant="ghost">
                            <Link
                              to="/characters/$id"
                              params={{ id: c.id }}
                              search={{ from: `campaign:${id}:${tabParam ?? "roster"}` }}
                            >
                              {t("roster.openSheet")}
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
                                <AlertDialogTitle>
                                  {t("roster.removeConfirmTitle")}
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                  {t("roster.removeConfirmBody", {
                                    name: c.name,
                                    npcNote: c.is_npc ? t("roster.removeConfirmNpcNote") : "",
                                  })}
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>{tc("actions.cancel")}</AlertDialogCancel>
                                <AlertDialogAction onClick={() => removeFromCampaign.mutate(c.id)}>
                                  {t("roster.remove")}
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
            <h3 className="font-display text-sm font-semibold">
              {t("roster.submitSection.title")}
            </h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {(mine.data ?? [])
                .filter((c) => c.campaign_id !== id)
                .map((c) => (
                  <Button
                    key={c.id}
                    size="sm"
                    variant="outline"
                    onClick={() => attach.mutate(c.id)}
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" /> {c.name}
                  </Button>
                ))}
              {(mine.data ?? []).filter((c) => c.campaign_id !== id).length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t("roster.submitSection.allSubmitted")}
                </p>
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
            <BattlePanel campaignId={id} isGm={isGm} focusMapId={itemParam ?? null} />
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

        {isGm ? (
          <TabsContent value="adapt" className="mt-6">
            <Suspense fallback={<PanelFallback />}>
              <AdaptationPanel campaignId={id} />
            </Suspense>
          </TabsContent>
        ) : null}

        <TabsContent value="notes" className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
          <div className="space-y-3">
            <div className="w-full sm:w-60">
              <Select value={noteFilter} onValueChange={setNoteFilter}>
                <SelectTrigger aria-label={t("notes.filterAria")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("notes.filters.all")}</SelectItem>
                  <SelectItem value="note">{t("notes.filters.note")}</SelectItem>
                  <SelectItem value="handout">{t("notes.filters.handout")}</SelectItem>
                  <SelectItem value="session">{t("notes.filters.session")}</SelectItem>
                  <SelectItem value="npc">{t("notes.filters.npc")}</SelectItem>
                  <SelectItem value="party-inventory">
                    {t("notes.filters.partyInventory")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            {notes.isLoading ? (
              [0, 1].map((i) => <Skeleton key={i} className="h-24 w-full rounded-lg" />)
            ) : visibleNotes.length ? (
              visibleNotes.map((n) => (
                <article key={n.id} data-search-id={n.id} className="panel p-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-medium">{n.title}</h3>
                    <div className="flex items-center gap-2">
                      <div className="flex flex-col items-end gap-1">
                        <Badge variant="outline" className="text-[10px]">
                          {n.kind}
                        </Badge>
                        <VisibilityBadge
                          visibility={n.gm_only ? "GM_ONLY" : "ALL_PLAYERS"}
                          isGm={isGm}
                        />
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => removeNote.mutate(n.id)}
                        aria-label={t("notes.deleteAria")}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{n.body}</p>
                </article>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">{t("notes.empty")}</p>
            )}
          </div>

          <div className="panel h-fit space-y-3 p-4">
            <h3 className="font-display text-sm font-semibold">{t("notes.addEntry.title")}</h3>
            <Input
              placeholder={t("notes.addEntry.titlePlaceholder")}
              value={noteTitle}
              onChange={(e) => setNoteTitle(e.target.value)}
            />
            <Textarea
              rows={5}
              placeholder={t("notes.addEntry.bodyPlaceholder")}
              value={noteBody}
              onChange={(e) => setNoteBody(e.target.value)}
            />
            <Select value={noteKind} onValueChange={setNoteKind}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="note">{t("notes.kinds.note")}</SelectItem>
                <SelectItem value="handout">{t("notes.kinds.handout")}</SelectItem>
                <SelectItem value="session">{t("notes.kinds.session")}</SelectItem>
                <SelectItem value="npc">{t("notes.kinds.npc")}</SelectItem>
                <SelectItem value="party-inventory">{t("notes.kinds.partyInventory")}</SelectItem>
              </SelectContent>
            </Select>
            {isGm ? (
              <div className="flex items-center justify-between">
                <Label htmlFor="gm-only">{t("notes.addEntry.gmOnlyLabel")}</Label>
                <Switch id="gm-only" checked={gmOnly} onCheckedChange={setGmOnly} />
              </div>
            ) : null}
            <Button
              className="w-full"
              onClick={() => createNote.mutate()}
              disabled={!noteTitle || createNote.isPending}
            >
              {t("notes.addEntry.submit")}
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
                          {t("members.makeGm")}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{t("members.transferConfirmTitle")}</AlertDialogTitle>
                          <AlertDialogDescription>
                            {t("members.transferConfirmBody", { name: m.display_name })}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{tc("actions.cancel")}</AlertDialogCancel>
                          <AlertDialogAction onClick={() => transferGm.mutate(m.user_id)}>
                            {t("members.transfer")}
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
                          aria-label={t("members.removeAria", { name: m.display_name })}
                          disabled={removeMemberMut.isPending}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{t("members.removeConfirmTitle")}</AlertDialogTitle>
                          <AlertDialogDescription>
                            {t("members.removeConfirmBody", { name: m.display_name })}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{tc("actions.cancel")}</AlertDialogCancel>
                          <AlertDialogAction onClick={() => removeMemberMut.mutate(m.user_id)}>
                            {t("roster.remove")}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                  {isGm && m.role !== "gm" ? (
                    <Select
                      value={m.role}
                      onValueChange={(v) =>
                        changeRole.mutate({ userId: m.user_id, role: v as "player" | "producer" })
                      }
                    >
                      <SelectTrigger className="h-8 w-32" aria-label={t("members.roleLabel")}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="player">{t("members.rolePlayer")}</SelectItem>
                        <SelectItem value="producer">{t("members.roleProducer")}</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge variant={m.role === "gm" ? "default" : "outline"}>
                      {m.role === "gm"
                        ? t("list.badge.gm")
                        : m.role === "producer"
                          ? t("list.badge.producer")
                          : t("list.badge.player")}
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        {isGm || isProducer ? (
          <TabsContent value="submissions" className="mt-6">
            <SubmissionsPanel
              campaignId={id}
              isGm={isGm}
              isProducer={isProducer}
              userId={user?.id}
              members={members.data ?? []}
            />
          </TabsContent>
        ) : null}

        <TabsContent value="rules" className="mt-6">
          <HouseRules
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
  settings,
  disabled,
  knownPacks,
  onSave,
}: {
  settings: Record<string, unknown>;
  disabled: boolean;
  knownPacks: string[];
  onSave: (patch: Record<string, unknown>) => void;
}) {
  const { t } = useT("campaigns");
  const { t: tc } = useT("common");
  const [pointLimit, setPointLimit] = useState(String(settings["point_limit"] ?? 150));
  const [disadvLimit, setDisadvLimit] = useState(String(settings["disadvantage_limit"] ?? -50));
  const [tl, setTl] = useState(String(settings["tech_level"] ?? 8));
  const [houseRules, setHouseRules] = useState(String(settings["house_rules"] ?? ""));
  const [packs, setPacks] = useState<string[]>(allowedPacksOf(settings));
  const [newPack, setNewPack] = useState("");
  const packOptions = useMemo(
    () => Array.from(new Set([...knownPacks, ...packs])).sort((a, b) => a.localeCompare(b)),
    [knownPacks, packs],
  );
  const togglePack = (name: string, on: boolean) =>
    setPacks((prev) => (on ? [...new Set([...prev, name])] : prev.filter((p) => p !== name)));

  return (
    <div className="panel max-w-4xl space-y-4 p-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label>{t("houseRules.pointLimit")}</Label>
          <Input
            value={pointLimit}
            onChange={(e) => setPointLimit(e.target.value)}
            disabled={disabled}
          />
        </div>
        <div className="space-y-1.5">
          <Label>{t("houseRules.disadvantageLimit")}</Label>
          <Input
            value={disadvLimit}
            onChange={(e) => setDisadvLimit(e.target.value)}
            disabled={disabled}
          />
        </div>
        <div className="space-y-1.5">
          <Label>{t("houseRules.techLevel")}</Label>
          <Input value={tl} onChange={(e) => setTl(e.target.value)} disabled={disabled} />
        </div>
      </div>
      <div className="space-y-2">
        <Label>{t("houseRules.packs.label")}</Label>
        {packOptions.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("houseRules.packs.empty")}</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {packOptions.map((p) => (
              <label key={p} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={packs.includes(p)}
                  disabled={disabled}
                  onCheckedChange={(v) => togglePack(p, v === true)}
                  aria-label={t("houseRules.packs.enableAria", { name: p })}
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
            placeholder={t("houseRules.packs.addPlaceholder")}
            aria-label={t("houseRules.packs.addPlaceholder")}
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
            {tc("actions.add")}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{t("houseRules.packs.hint")}</p>
      </div>
      <div className="border-t border-border" />
      <CampaignRules
        settings={settings}
        disabled={disabled}
        onSave={(overrides) => onSave({ [CAMPAIGN_RULESET_SETTING]: overrides })}
      />
      <div className="border-t border-border" />
      <div className="space-y-1.5">
        <Label>{t("houseRules.houseRulesLabel")}</Label>
        <Textarea
          rows={8}
          value={houseRules}
          onChange={(e) => setHouseRules(e.target.value)}
          disabled={disabled}
          placeholder={t("houseRules.houseRulesPlaceholder")}
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
        {t("houseRules.save")}
      </Button>
    </div>
  );
}

function CampaignCover({
  campaignId,
  settings,
  disabled,
}: {
  campaignId: string;
  settings: Record<string, unknown>;
  disabled: boolean;
}) {
  const { t } = useT("campaigns");
  const queryClient = useQueryClient();
  const coverPath =
    typeof settings[CAMPAIGN_COVER_SETTING] === "string"
      ? String(settings[CAMPAIGN_COVER_SETTING])
      : null;
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const savedPosition = coverPositionFromSettings(settings);
  const [positionDraft, setPositionDraft] = useState<number | null>(null);
  const positionY = positionDraft ?? savedPosition;

  useEffect(() => setPositionDraft(null), [savedPosition]);

  useEffect(
    () => () => {
      if (coverPreview) URL.revokeObjectURL(coverPreview);
    },
    [coverPreview],
  );

  const refreshCampaigns = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["campaign", campaignId] }),
      queryClient.invalidateQueries({ queryKey: ["campaigns"] }),
    ]);

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
      await refreshCampaigns();
      setCoverPreview(null);
      toast.success(t("houseRules.cover.updated"));
    },
    onError: (error: Error) => {
      setCoverPreview(null);
      toast.error(error.message);
    },
  });

  const removeCover = useMutation({
    mutationFn: async () => {
      await updateCampaign(campaignId, {
        settings: {
          ...settings,
          [CAMPAIGN_COVER_SETTING]: null,
          [CAMPAIGN_COVER_POSITION_SETTING]: null,
        } as never,
      });
      if (coverPath) await removeCampaignCoverFile(coverPath).catch(() => undefined);
    },
    onSuccess: async () => {
      await refreshCampaigns();
      toast.success(t("houseRules.cover.removed"));
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const savePosition = useMutation({
    mutationFn: async (value: number) => {
      await updateCampaign(campaignId, {
        settings: { ...settings, [CAMPAIGN_COVER_POSITION_SETTING]: value } as never,
      });
    },
    onSuccess: () => refreshCampaigns(),
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="panel max-w-4xl space-y-4 p-6">
      <div>
        <Label>{t("houseRules.cover.label")}</Label>
        <p className="mt-1 text-xs text-muted-foreground">{t("houseRules.cover.hint")}</p>
      </div>
      {coverPath || coverPreview ? (
        <div className="relative aspect-[16/7] overflow-hidden rounded-lg border border-border">
          <CampaignCoverBg path={coverPath} previewUrl={coverPreview} positionY={positionY} />
        </div>
      ) : null}
      {coverPath && !disabled ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="cover-framing">{t("houseRules.cover.framing")}</Label>
            <span className="text-xs text-muted-foreground">
              {t("houseRules.cover.framingHint")}
            </span>
          </div>
          <Slider
            id="cover-framing"
            min={0}
            max={100}
            step={1}
            value={[positionY]}
            disabled={savePosition.isPending}
            onValueChange={([v]) => setPositionDraft(v ?? 0)}
            onValueCommit={([v]) => {
              setPositionDraft(v ?? 0);
              savePosition.mutate(v ?? 0);
            }}
            aria-label={t("houseRules.cover.framing")}
          />
        </div>
      ) : null}
      {!disabled ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
          <FileDropzone
            compact
            accept="image/*,.heic,.heif,.tif,.tiff,.bmp"
            loading={cover.isPending}
            loadingLabel={t("houseRules.cover.uploadingLabel")}
            className="min-h-20 flex-1"
            label={coverPath ? t("houseRules.cover.dropReplace") : t("houseRules.cover.dropNew")}
            hint={t("houseRules.cover.sizeHint")}
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
              aria-label={t("houseRules.cover.removeAria")}
              disabled={cover.isPending || removeCover.isPending}
              onClick={() => removeCover.mutate()}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
