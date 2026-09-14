import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Users } from "lucide-react";
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


export const Route = createFileRoute("/_authenticated/campaigns/")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Campaigns — Universal Character Forge" },
      {
        name: "description",
        content: "Run or join campaigns with invite codes, rosters, house rules and shared notes.",
      },
      { property: "og:title", content: "Campaigns — Universal Character Forge" },
      { property: "og:description", content: "Rosters, invite codes and shared notes." },
    ],
  }),
  component: CampaignsPage,
});

function CampaignsPage() {
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
      toast.success("Joined campaign.");
      setCode("");
      navigate({ to: "/campaigns/$id", params: { id } });
    },
    onError: () => toast.error("That invite code didn't match an open campaign."),
  });

  const remove = useMutation({
    mutationFn: (cid: string) => deleteCampaign(cid),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      toast.success("Campaign deleted.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      <PageHeader
        title="Campaigns"
        description="Tables you run and tables you play at."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" /> New campaign
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New campaign</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4">
                <CampaignPackageImport
                  onImported={(id) => {
                    setOpen(false);
                    navigate({ to: "/campaigns/$id", params: { id } });
                  }}
                />

                <div className="space-y-1.5">
                  <Label>Name</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Premise</Label>
                  <Textarea
                    rows={3}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label>Point limit</Label>
                    <Input value={pointLimit} onChange={(e) => setPointLimit(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Disadv. limit</Label>
                    <Input value={disadvLimit} onChange={(e) => setDisadvLimit(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Tech level</Label>
                    <Input value={tl} onChange={(e) => setTl(e.target.value)} />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => create.mutate()} disabled={!name || create.isPending}>
                  Create campaign
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="panel mb-6 flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-[200px] flex-1 space-y-1.5">
          <Label htmlFor="code">Join with an invite code</Label>
          <Input
            id="code"
            placeholder="e.g. 7KQ2F4"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </div>
        <Button variant="outline" onClick={() => join.mutate()} disabled={!code || join.isPending}>
          Join
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
          <p className="mt-3 text-sm text-muted-foreground">
            No campaigns yet. Create one as GM, or join with a code from your Game Master.
          </p>
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
                    {c.gm_id === user?.id ? "GM" : "Player"}
                  </Badge>
                </div>
                <p className="relative mt-2 line-clamp-3 text-sm text-muted-foreground">
                  {c.description || "No premise written yet."}
                </p>
                <div className="relative mt-auto flex gap-4 pt-4 text-xs text-muted-foreground">
                  <span>{settings["point_limit"] ?? "—"} pts</span>
                  <span>TL {settings["tech_level"] ?? "—"}</span>
                  <span className="font-mono">{c.invite_code}</span>
                </div>
                {c.gm_id === user?.id ? (
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
                          aria-label="Delete campaign"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete this campaign?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This permanently removes {c.name} and everything inside it: lore,
                            maps, notes, soundtrack, intro video, reveals and roll history.
                            Characters are kept, but they are detached from the campaign. This
                            cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => remove.mutate(c.id)}
                            disabled={remove.isPending}
                          >
                            Delete campaign
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
    </div>
  );
}
