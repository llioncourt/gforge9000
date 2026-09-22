import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, KeyRound, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  createMcpToken,
  listMcpTokens,
  revokeMcpToken,
  type McpTokenRow,
} from "@/lib/mcp-tokens.functions";
import { useT } from "@/i18n/hooks";
import { metaText } from "@/i18n/meta";

export const Route = createFileRoute("/_authenticated/assistant")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: metaText("settings", "assistant.metaTitle") },
      { name: "description", content: metaText("settings", "assistant.metaDescription") },
      { property: "og:title", content: metaText("settings", "assistant.metaTitle") },
      { property: "og:description", content: metaText("settings", "assistant.metaDescription") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AssistantPage,
});

function AssistantPage() {
  const { t } = useT("settings");
  const { t: tc } = useT("common");
  const queryClient = useQueryClient();
  const load = useServerFn(listMcpTokens);
  const create = useServerFn(createMcpToken);
  const revoke = useServerFn(revokeMcpToken);

  const [name, setName] = useState("Claude");
  const [newToken, setNewToken] = useState<string | null>(null);
  const [pendingRevoke, setPendingRevoke] = useState<McpTokenRow | null>(null);

  const tokens = useQuery({ queryKey: ["mcp-tokens"], queryFn: () => load({}) });

  const endpoint =
    typeof window === "undefined" ? "" : `${window.location.origin}/api/public/mcp`;

  const createKey = useMutation({
    mutationFn: async () => create({ data: { name: name.trim() || "Claude" } }),
    onSuccess: async (result) => {
      setNewToken(result.token);
      await queryClient.invalidateQueries({ queryKey: ["mcp-tokens"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const revokeKey = useMutation({
    mutationFn: async (id: string) => revoke({ data: { id } }),
    onSuccess: async () => {
      setPendingRevoke(null);
      toast.success(t("assistant.revoked"));
      await queryClient.invalidateQueries({ queryKey: ["mcp-tokens"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  async function copy(value: string) {
    await navigator.clipboard.writeText(value);
    toast.success(t("assistant.copied"));
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t("assistant.title")} description={t("assistant.description")} />

      <section className="space-y-3 rounded-xl border p-4">
        <h2 className="font-medium">{t("assistant.addressTitle")}</h2>
        <div className="flex items-center gap-2">
          <Input readOnly value={endpoint} className="font-mono text-xs" />
          <Button variant="outline" size="icon" onClick={() => copy(endpoint)}>
            <Copy className="size-4" />
          </Button>
        </div>
        <p className="text-muted-foreground text-sm">{t("assistant.addressHint")}</p>
      </section>

      <section className="space-y-4 rounded-xl border p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-2">
            <Label htmlFor="key-name">{t("assistant.nameLabel")}</Label>
            <Input
              id="key-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-56"
            />
          </div>
          <Button onClick={() => createKey.mutate()} disabled={createKey.isPending}>
            <Plus className="mr-2 size-4" />
            {t("assistant.createKey")}
          </Button>
        </div>

        {tokens.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-14 w-full rounded-lg" />
            <Skeleton className="h-14 w-full rounded-lg" />
          </div>
        ) : (tokens.data ?? []).length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("assistant.empty")}</p>
        ) : (
          <ul className="space-y-2">
            {(tokens.data ?? []).map((token) => (
              <li
                key={token.id}
                className="flex items-center justify-between gap-3 rounded-lg border p-3"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{token.name}</p>
                  <p className="text-muted-foreground truncate font-mono text-xs">
                    {token.token_prefix}…
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t("assistant.revoke")}
                  onClick={() => setPendingRevoke(token)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Dialog open={newToken !== null} onOpenChange={(open) => (open ? null : setNewToken(null))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="size-4" /> {t("assistant.newKeyTitle")}
            </DialogTitle>
            <DialogDescription>{t("assistant.newKeyDescription")}</DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <Input readOnly value={newToken ?? ""} className="font-mono text-xs" />
            <Button variant="outline" size="icon" onClick={() => copy(newToken ?? "")}>
              <Copy className="size-4" />
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setNewToken(null)}>{tc("actions.close")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={pendingRevoke !== null}
        onOpenChange={(open) => (open ? null : setPendingRevoke(null))}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("assistant.revokeTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("assistant.revokeDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc("actions.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => pendingRevoke && revokeKey.mutate(pendingRevoke.id)}
              disabled={revokeKey.isPending}
            >
              {t("assistant.revoke")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
