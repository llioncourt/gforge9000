import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/page-header";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getAdminOverview,
  getIsAdmin,
  setUserAdmin,
  setUserBlocked,
  setUserPassword,
} from "@/lib/admin.functions";
import { matchesSearch } from "@/lib/search";
import { useT } from "@/i18n/hooks";

export const Route = createFileRoute("/_authenticated/admin")({
  staticData: { sitemap: false },
  head: () => ({ meta: [{ title: "Admin — Character Forge" }] }),
  component: AdminPage,
});

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 font-display text-2xl font-semibold">{value}</div>
    </div>
  );
}

function AdminPage() {
  const { t } = useT("navigation");
  const qc = useQueryClient();
  const isAdminFn = useServerFn(getIsAdmin);
  const overviewFn = useServerFn(getAdminOverview);
  const blockFn = useServerFn(setUserBlocked);
  const adminFn = useServerFn(setUserAdmin);
  const passwordFn = useServerFn(setUserPassword);
  const [q, setQ] = useState("");
  const [pwUser, setPwUser] = useState<{ id: string; email: string } | null>(null);
  const [pw, setPw] = useState("");

  const isAdmin = useQuery({ queryKey: ["is-admin"], queryFn: () => isAdminFn() });
  const overview = useQuery({
    queryKey: ["admin-overview"],
    queryFn: () => overviewFn(),
    enabled: isAdmin.data === true,
  });

  const onError = (e: unknown) => toast.error(e instanceof Error ? e.message : String(e));
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-overview"] });
  const block = useMutation({
    mutationFn: (v: { userId: string; blocked: boolean }) => blockFn({ data: v }),
    onSuccess: refresh,
    onError,
  });
  const promote = useMutation({
    mutationFn: (v: { userId: string; admin: boolean }) => adminFn({ data: v }),
    onSuccess: refresh,
    onError,
  });
  const setPassword = useMutation({
    mutationFn: (v: { userId: string; password: string }) => passwordFn({ data: v }),
    onSuccess: () => {
      toast.success(t("admin.password.done"));
      setPwUser(null);
      setPw("");
      refresh();
    },
    onError,
  });

  const users = useMemo(
    () => (overview.data?.users ?? []).filter((u) => matchesSearch(q, [u.name, u.email])),
    [overview.data, q],
  );
  const campaigns = useMemo(
    () => (overview.data?.campaigns ?? []).filter((c) => matchesSearch(q, [c.name, c.gm])),
    [overview.data, q],
  );

  if (isAdmin.isSuccess && !isAdmin.data) {
    return <PageHeader title={t("admin.title")} description={t("admin.notAllowed")} />;
  }

  const d = overview.data;
  const fmt = (s: string | null) => (s ? new Date(s).toLocaleDateString() : "—");

  return (
    <div>
      <PageHeader title={t("admin.title")} description={t("admin.description")} />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {d ? (
          <>
            <Stat label={t("admin.stats.users")} value={d.users.length} />
            <Stat
              label={t("admin.stats.blocked")}
              value={d.users.filter((u) => u.blocked).length}
            />
            <Stat label={t("admin.stats.campaigns")} value={d.campaigns.length} />
            <Stat
              label={t("admin.stats.characters")}
              value={d.users.reduce((n, u) => n + u.characters, 0)}
            />
          </>
        ) : (
          [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[82px] rounded-md" />)
        )}
      </div>

      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t("admin.search")}
        className="mb-4 max-w-sm"
      />

      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users">{t("admin.tabs.users")}</TabsTrigger>
          <TabsTrigger value="campaigns">{t("admin.tabs.campaigns")}</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="mt-4">
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-3">{t("admin.cols.user")}</th>
                  <th className="p-3">{t("admin.cols.joined")}</th>
                  <th className="p-3">{t("admin.cols.lastSeen")}</th>
                  <th className="p-3">{t("admin.cols.characters")}</th>
                  <th className="p-3">{t("admin.cols.campaigns")}</th>
                  <th className="p-3">{t("admin.cols.admin")}</th>
                  <th className="p-3">{t("admin.cols.blocked")}</th>
                  <th className="p-3">{t("admin.cols.access")}</th>
                </tr>
              </thead>
              <tbody>
                {!d
                  ? [0, 1, 2, 3, 4].map((i) => (
                      <tr key={i} className="border-t border-border">
                        <td colSpan={8} className="p-3">
                          <Skeleton className="h-8" />
                        </td>
                      </tr>
                    ))
                  : users.map((u) => (
                      <tr key={u.id} className="border-t border-border">
                        <td className="p-3">
                          <div className="font-medium">{u.name || u.email}</div>
                          <div className="text-xs text-muted-foreground">{u.email}</div>
                        </td>
                        <td className="p-3">{fmt(u.createdAt)}</td>
                        <td className="p-3">{fmt(u.lastSignIn)}</td>
                        <td className="p-3">{u.characters}</td>
                        <td className="p-3">{u.campaigns}</td>
                        <td className="p-3">
                          <Switch
                            checked={u.isAdmin}
                            onCheckedChange={(v) => promote.mutate({ userId: u.id, admin: v })}
                          />
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={u.blocked}
                              onCheckedChange={(v) => block.mutate({ userId: u.id, blocked: v })}
                            />
                            {u.blocked ? (
                              <Badge variant="destructive">{t("admin.blockedBadge")}</Badge>
                            ) : null}
                          </div>
                        </td>
                        <td className="p-3">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setPwUser({ id: u.id, email: u.email });
                              setPw("");
                            }}
                          >
                            {t("admin.password.action")}
                          </Button>
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="campaigns" className="mt-4">
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-3">{t("admin.cols.campaign")}</th>
                  <th className="p-3">{t("admin.cols.gm")}</th>
                  <th className="p-3">{t("admin.cols.members")}</th>
                  <th className="p-3">{t("admin.cols.characters")}</th>
                  <th className="p-3">{t("admin.cols.created")}</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.id} className="border-t border-border">
                    <td className="p-3 font-medium">{c.name}</td>
                    <td className="p-3">{c.gm}</td>
                    <td className="p-3">{c.members}</td>
                    <td className="p-3">{c.characters}</td>
                    <td className="p-3">{fmt(c.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={pwUser !== null} onOpenChange={(o) => !o && setPwUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("admin.password.title")}</DialogTitle>
            <DialogDescription>
              {t("admin.password.description", { email: pwUser?.email ?? "" })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="admin-password">{t("admin.password.label")}</Label>
            <Input
              id="admin-password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder={t("admin.password.placeholder")}
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">{t("admin.password.hint")}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPwUser(null)}>
              {t("admin.password.cancel")}
            </Button>
            <Button
              disabled={pw.trim().length < 8 || setPassword.isPending}
              onClick={() =>
                pwUser && setPassword.mutate({ userId: pwUser.id, password: pw.trim() })
              }
            >
              {t("admin.password.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
