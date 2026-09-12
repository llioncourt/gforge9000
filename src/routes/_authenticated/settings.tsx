import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { getProfile, upsertProfile } from "@/lib/api";
import { useSession } from "@/hooks/use-session";

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
        </div>
      )}
    </div>
  );
}
