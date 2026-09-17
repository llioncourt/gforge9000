import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
} from "@/components/ui/alert-dialog";
import { addNote, deleteNote, listNotes, updateNote, type NoteRow } from "@/lib/api";
import { VisibilityBadge } from "@/components/lore/visibility-badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SessionChroniclePanel } from "@/components/adaptation/session-chronicle-panel";
import { useT, useFormatters } from "@/i18n/hooks";

const PREP = "session-prep";
const RECAP = "session";

interface Session {
  title: string;
  prep: NoteRow | null;
  recap: NoteRow | null;
  createdAt: string;
}

/** Groups the campaign's session notes into one prep + one recap card per session. */
function groupSessions(rows: NoteRow[]): Session[] {
  const byTitle = new Map<string, Session>();
  for (const row of rows) {
    if (row.kind !== PREP && row.kind !== RECAP) continue;
    const current = byTitle.get(row.title) ?? {
      title: row.title,
      prep: null,
      recap: null,
      createdAt: row.created_at,
    };
    if (row.kind === PREP) current.prep = row;
    else current.recap = row;
    if (row.created_at < current.createdAt) current.createdAt = row.created_at;
    byTitle.set(row.title, current);
  }
  return [...byTitle.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function SessionsListView({ campaignId, isGm }: { campaignId: string; isGm: boolean }) {
  const { t } = useT("lore");
  const { t: tc } = useT("common");
  const f = useFormatters();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [removing, setRemoving] = useState<Session | null>(null);

  const notes = useQuery({ queryKey: ["notes", campaignId], queryFn: () => listNotes(campaignId) });
  const sessions = useMemo(() => groupSessions(notes.data ?? []), [notes.data]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["notes", campaignId] });

  const create = useMutation({
    mutationFn: async () => {
      const name =
        title.trim() || t("sessionsPanel.sessionPlaceholder", { n: sessions.length + 1 });
      await addNote({
        campaign_id: campaignId,
        title: name,
        body: "",
        kind: RECAP,
        gm_only: false,
      } as never);
      if (isGm) {
        await addNote({
          campaign_id: campaignId,
          title: name,
          body: "",
          kind: PREP,
          gm_only: true,
        } as never);
      }
    },
    onSuccess: () => {
      setTitle("");
      invalidate();
      toast.success(t("sessionsPanel.sessionAdded"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (session: Session) => {
      if (session.prep) await deleteNote(session.prep.id);
      if (session.recap) await deleteNote(session.recap.id);
    },
    onSuccess: () => {
      setRemoving(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="panel flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <CalendarDays className="h-4 w-4 text-muted-foreground" />
        <p className="flex-1 text-sm text-muted-foreground">{t("sessionsPanel.intro")}</p>
        <div className="flex gap-2">
          <Input
            className="sm:w-56"
            placeholder={t("sessionsPanel.sessionPlaceholder", { n: sessions.length + 1 })}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <Button onClick={() => create.mutate()} disabled={create.isPending}>
            <Plus className="mr-1 h-4 w-4" /> {t("sessionsPanel.newSession")}
          </Button>
        </div>
      </div>

      {notes.isLoading ? (
        <div className="space-y-4">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-48 w-full rounded-lg" />
          ))}
        </div>
      ) : sessions.length ? (
        <div className="space-y-4">
          {sessions.map((session) => (
            <article key={session.title} className="panel space-y-4 p-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-display text-base font-semibold">{session.title}</h3>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">
                    {f.date(session.createdAt)}
                  </Badge>
                  {isGm ? (
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={t("sessionsPanel.deleteSessionAria")}
                      onClick={() => setRemoving(session)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  ) : null}
                </div>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                {isGm ? (
                  <div className="space-y-2">
                    <SessionField
                      label={t("sessionsPanel.prepLabel")}
                      placeholder={t("sessionsPanel.prepPlaceholder")}
                      note={session.prep}
                      onCreate={(body) =>
                        addNote({
                          campaign_id: campaignId,
                          title: session.title,
                          body,
                          kind: PREP,
                          gm_only: true,
                        } as never).then(invalidate)
                      }
                      onSave={(body) => updateNote(session.prep!.id, { body }).then(invalidate)}
                    />
                    <VisibilityBadge visibility="GM_ONLY" isGm={isGm} />
                  </div>
                ) : null}
                <div className="space-y-2">
                  <SessionField
                    label={t("sessionsPanel.recapLabel")}
                    placeholder={t("sessionsPanel.recapPlaceholder")}
                    note={session.recap}
                    readOnly={!isGm && !session.recap}
                    onCreate={(body) =>
                      addNote({
                        campaign_id: campaignId,
                        title: session.title,
                        body,
                        kind: RECAP,
                        gm_only: false,
                      } as never).then(invalidate)
                    }
                    onSave={(body) => updateNote(session.recap!.id, { body }).then(invalidate)}
                  />
                  <VisibilityBadge visibility="ALL_PLAYERS" isGm={isGm} />
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{t("sessionsPanel.noSessionsYet")}</p>
      )}

      <AlertDialog open={!!removing} onOpenChange={(open) => !open && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("sessionsPanel.deleteDialog.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("sessionsPanel.deleteDialog.description", { title: removing?.title })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc("actions.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => removing && remove.mutate(removing)}>
              {tc("actions.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function SessionsPanel({ campaignId, isGm }: { campaignId: string; isGm: boolean }) {
  const { t } = useT("adaptation");
  const [view, setView] = useState<"sessions" | "chronicle">("sessions");

  if (!isGm) return <SessionsListView campaignId={campaignId} isGm={isGm} />;

  return (
    <div className="space-y-6">
      <Tabs value={view} onValueChange={(v) => setView(v as "sessions" | "chronicle")}>
        <TabsList>
          <TabsTrigger value="sessions">{t("chronicle.viewToggle.sessions")}</TabsTrigger>
          <TabsTrigger value="chronicle">{t("chronicle.viewToggle.chronicle")}</TabsTrigger>
        </TabsList>
      </Tabs>
      {view === "sessions" ? (
        <SessionsListView campaignId={campaignId} isGm={isGm} />
      ) : (
        <SessionChroniclePanel campaignId={campaignId} isGm={isGm} />
      )}
    </div>
  );
}

function SessionField({
  label,
  placeholder,
  note,
  readOnly,
  onCreate,
  onSave,
}: {
  label: string;
  placeholder: string;
  note: NoteRow | null;
  readOnly?: boolean;
  onCreate: (body: string) => Promise<unknown>;
  onSave: (body: string) => Promise<unknown>;
}) {
  const { t } = useT("lore");
  const { t: tc } = useT("common");
  const [draft, setDraft] = useState(note?.body ?? "");
  const [saving, setSaving] = useState(false);
  const dirty = draft !== (note?.body ?? "");

  if (readOnly) {
    return (
      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="text-sm text-muted-foreground">{t("sessionsPanel.nothingSharedYet")}</p>
      </div>
    );
  }

  const save = async () => {
    setSaving(true);
    try {
      if (note) await onSave(draft);
      else await onCreate(draft);
      toast.success(tc("states.saved"));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <Textarea
        rows={7}
        placeholder={placeholder}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
      />
      <Button size="sm" variant="outline" onClick={save} disabled={!dirty || saving}>
        <Save className="mr-1 h-4 w-4" /> {tc("actions.save")}
      </Button>
    </div>
  );
}
