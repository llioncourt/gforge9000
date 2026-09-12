import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import { getProfile, upsertProfile, wipeAllMyData } from "@/lib/api";
import { lovable } from "@/integrations/lovable/index";
import { useSession } from "@/hooks/use-session";
import { AUDIT_SUMMARY, RULES_AUDIT } from "@/rules/audit";

const WIPE_INTENT_KEY = "ucf:wipe-intent";
const WIPE_INTENT_TTL = 5 * 60 * 1000;


export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Universal Character Forge" },
      { name: "description", content: "Profile, display preferences and account details." },
      { property: "og:title", content: "Settings — Universal Character Forge" },
      { property: "og:description", content: "Manage your profile and preferences." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: () => getProfile(user!.id),
    enabled: !!user,
  });

  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [light, setLight] = useState(false);
  const [wipeOpen, setWipeOpen] = useState(false);
  const [verified, setVerified] = useState(false);
  const [verifying, setVerifying] = useState(false);

  // A full-page Google redirect returns here: restore the pending intent.
  useEffect(() => {
    const raw = sessionStorage.getItem(WIPE_INTENT_KEY);
    if (!raw) return;
    sessionStorage.removeItem(WIPE_INTENT_KEY);
    if (Date.now() - Number(raw) > WIPE_INTENT_TTL) return;
    setVerified(true);
    setWipeOpen(true);
  }, []);

  async function confirmWithGoogle() {
    setVerifying(true);
    sessionStorage.setItem(WIPE_INTENT_KEY, String(Date.now()));
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: `${window.location.origin}/settings`,
      });
      if ("redirected" in result && result.redirected) return;
      if (result.error) throw result.error;
      sessionStorage.removeItem(WIPE_INTENT_KEY);
      setVerified(true);
      toast.success("Identity confirmed.");
    } catch (e) {
      sessionStorage.removeItem(WIPE_INTENT_KEY);
      toast.error(e instanceof Error ? e.message : "Could not confirm your identity.");
    } finally {
      setVerifying(false);
    }
  }

  const wipe = useMutation({
    mutationFn: wipeAllMyData,
    onSuccess: () => {
      queryClient.clear();
      setWipeOpen(false);
      setVerified(false);
      toast.success("Everything was deleted. Your account is still here.");
    },
    onError: (e: Error) => toast.error(e.message),
  });


  useEffect(() => {
    if (data) {
      setDisplayName(data.display_name ?? "");
      setBio(data.bio ?? "");
    }
  }, [data]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", !light);
  }, [light]);

  const save = useMutation({
    mutationFn: () => upsertProfile(user!.id, { display_name: displayName, bio }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      toast.success("Profile saved.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="max-w-2xl">
      <PageHeader title="Settings" description="Your profile and workspace preferences." />

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-[88px] w-full rounded-lg" />
          <Skeleton className="h-[140px] w-full rounded-lg" />
        </div>
      ) : (
        <div className="space-y-6">
          <section className="panel space-y-4 p-6">
            <h2 className="font-display text-lg font-semibold">Profile</h2>
            <div className="space-y-1.5">
              <Label htmlFor="display">Display name</Label>
              <Input
                id="display"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bio">About you</Label>
              <Textarea id="bio" rows={4} value={bio} onChange={(e) => setBio(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input value={user?.email ?? ""} readOnly disabled />
            </div>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              Save profile
            </Button>
          </section>

          <section className="panel flex items-center justify-between gap-4 p-6">
            <div>
              <h2 className="font-display text-lg font-semibold">Light theme</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                The Forge is dark-first. Switch to the parchment palette for bright rooms and
                printing.
              </p>
            </div>
            <Switch checked={light} onCheckedChange={setLight} aria-label="Light theme" />
          </section>

          <section className="panel space-y-4 p-6">
            <div>
              <h2 className="font-display text-lg font-semibold">Rules status</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Every mechanic in the calculation engine, and how faithfully it is implemented.
                Exact {AUDIT_SUMMARY.EXACT} · Configurable {AUDIT_SUMMARY.CONFIGURABLE} ·
                Approximation {AUDIT_SUMMARY.APPROXIMATION} · Missing {AUDIT_SUMMARY.MISSING}
              </p>
            </div>
            <ul className="divide-y divide-border text-sm">
              {RULES_AUDIT.map((rule) => (
                <li key={rule.id} className="flex flex-col gap-1 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-foreground">{rule.title}</span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[11px] uppercase tracking-wide ${
                        rule.status === "EXACT"
                          ? "bg-emerald-500/15 text-emerald-400"
                          : rule.status === "CONFIGURABLE"
                            ? "bg-amber-500/15 text-amber-400"
                            : "bg-destructive/15 text-destructive"
                      }`}
                    >
                      {rule.status}
                    </span>
                  </div>
                  <p className="text-muted-foreground">{rule.notes}</p>
                </li>
              ))}
            </ul>
          </section>

          <section className="panel space-y-4 border-destructive/40 p-6">
            <div className="flex items-start gap-3">
              <ShieldAlert className="mt-0.5 size-5 shrink-0 text-destructive" />
              <div>
                <h2 className="font-display text-lg font-semibold text-destructive">
                  Erase everything
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Deletes all your characters, campaigns, notes, library entries, packs and roll
                  history. Your account and sign-in stay. This cannot be undone, so you have to
                  confirm with your Google sign-in first.
                </p>
              </div>
            </div>
            <Button
              variant="destructive"
              onClick={() => {
                setVerified(false);
                setWipeOpen(true);
              }}
            >
              Erase all my data
            </Button>
          </section>
        </div>
      )}

      <AlertDialog
        open={wipeOpen}
        onOpenChange={(open) => {
          setWipeOpen(open);
          if (!open) setVerified(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Erase everything in your account?</AlertDialogTitle>
            <AlertDialogDescription>
              Characters, campaigns, notes, library entries, packs and roll history are deleted
              permanently. Confirm with your Google sign-in ({user?.email}) to continue.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={wipe.isPending}>Cancel</AlertDialogCancel>
            {verified ? (
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  wipe.mutate();
                }}
                disabled={wipe.isPending}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {wipe.isPending ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : null}
                Delete everything
              </AlertDialogAction>
            ) : (
              <Button onClick={confirmWithGoogle} disabled={verifying}>
                {verifying ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                Confirm with Google
              </Button>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>

  );
}
