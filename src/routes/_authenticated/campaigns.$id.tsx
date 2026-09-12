import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  listNotes,
  setCharacterCampaign,
  toCharacterRecord,
  toEntry,
  updateCampaign,
  updateCharacter,
} from "@/lib/api";
import { buildSheet } from "@/rules";
import { useSession } from "@/hooks/use-session";

export const Route = createFileRoute("/_authenticated/campaigns/$id")({
  head: () => ({
    meta: [
      { title: "Campaign — Universal Character Forge" },
      {
        name: "description",
        content: "Roster, GM tools, shared notes and house rules for this campaign.",
      },
      { property: "og:title", content: "Campaign — Universal Character Forge" },
      { property: "og:description", content: "Roster, GM tools and shared notes." },
    ],
  }),
  component: CampaignPage,
});

function CampaignPage() {
  const { id } = Route.useParams();
  const { user } = useSession();
  const queryClient = useQueryClient();

  const campaign = useQuery({ queryKey: ["campaign", id], queryFn: () => getCampaign(id) });
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

  const approve = useMutation({
    mutationFn: ({ cid, value }: { cid: string; value: boolean }) =>
      updateCharacter(cid, { approved: value }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["campaign-characters", id] }),
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

  const saveSettings = useMutation({
    mutationFn: (patch: Record<string, unknown>) =>
      updateCampaign(id, { settings: { ...settings, ...patch } as never }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign", id] });
      toast.success("Campaign settings saved.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [noteTitle, setNoteTitle] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [noteKind, setNoteKind] = useState("note");
  const [gmOnly, setGmOnly] = useState(false);

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
        title={campaign.data?.name ?? "Campaign"}
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

      <Tabs defaultValue="roster">
        <TabsList>
          <TabsTrigger value="roster">Roster</TabsTrigger>
          <TabsTrigger value="notes">Notes &amp; handouts</TabsTrigger>
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="rules">House rules</TabsTrigger>
        </TabsList>

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
                return (
                  <div key={c.id} className="panel p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <Link
                          to="/characters/$id"
                          params={{ id: c.id }}
                          className="font-display font-semibold hover:underline"
                        >
                          {c.name}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {c.player_name || (c.is_npc ? "NPC" : "Player character")}
                        </p>
                      </div>
                      <Badge variant={c.approved ? "default" : "outline"}>
                        {c.approved ? "Approved" : "Pending"}
                      </Badge>
                    </div>

                    <div className="mt-4 grid grid-cols-4 gap-2 text-center">
                      <Mini label="HP" value={`${c.current_hp ?? sheet?.stats.hp ?? 0}/${sheet?.stats.hp ?? 0}`} />
                      <Mini label="FP" value={`${c.current_fp ?? sheet?.stats.fp ?? 0}/${sheet?.stats.fp ?? 0}`} />
                      <Mini label="Move" value={sheet?.encumbrance.effectiveMove ?? 0} />
                      <Mini label="Dodge" value={sheet?.encumbrance.effectiveDodge ?? 0} />
                    </div>
                    <div className="mt-2 grid grid-cols-4 gap-2 text-center">
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

                    {isGm ? (
                      <div className="mt-4 flex gap-2">
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
                      </div>
                    ) : null}
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

        <TabsContent value="notes" className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
          <div className="space-y-3">
            {notes.isLoading ? (
              [0, 1].map((i) => <Skeleton key={i} className="h-24 w-full rounded-lg" />)
            ) : notes.data?.length ? (
              notes.data.map((n) => (
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
              <p className="text-sm text-muted-foreground">No notes yet.</p>
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
              <div key={m.user_id} className="flex items-center justify-between p-4">
                <span>{m.display_name}</span>
                <Badge variant={m.role === "gm" ? "default" : "outline"}>{m.role}</Badge>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="rules" className="mt-6">
          <HouseRules
            settings={settings}
            disabled={!isGm}
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
  onSave,
}: {
  settings: Record<string, unknown>;
  disabled: boolean;
  onSave: (patch: Record<string, unknown>) => void;
}) {
  const [pointLimit, setPointLimit] = useState(String(settings["point_limit"] ?? 150));
  const [disadvLimit, setDisadvLimit] = useState(String(settings["disadvantage_limit"] ?? -50));
  const [tl, setTl] = useState(String(settings["tech_level"] ?? 8));
  const [houseRules, setHouseRules] = useState(String(settings["house_rules"] ?? ""));
  const [packs, setPacks] = useState(
    (Array.isArray(settings["allowed_packs"]) ? (settings["allowed_packs"] as string[]) : []).join(", "),
  );

  return (
    <div className="panel max-w-2xl space-y-4 p-6">
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
      <div className="space-y-1.5">
        <Label>Allowed content packs</Label>
        <Input
          value={packs}
          onChange={(e) => setPacks(e.target.value)}
          disabled={disabled}
          placeholder="Comma separated pack names, e.g. Core Generic Pack"
        />
        <p className="text-xs text-muted-foreground">
          Library entries are grouped by pack. Leave empty to allow every pack.
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
            allowed_packs: packs
              .split(",")
              .map((p) => p.trim())
              .filter(Boolean),
          })
        }
      >
        Save house rules
      </Button>
    </div>
  );
}
