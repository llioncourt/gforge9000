/**
 * Sheet-side surface for the optional content-pack link.
 *
 * Everything here is presentation: the state of an entry, the differences from
 * the pack, and the actions are all computed by the shared modules
 * (`src/lib/pack-link.ts`, `pack-match.ts`, `pack-link-service.ts`) that the
 * assistant uses too, so both always agree.
 */

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/i18n/hooks";
import type { CharacterEntry } from "@/rules";
import {
  type PackLinkState,
  type PackLinkStatus,
  type StaleReason,
} from "@/lib/pack-link";
import { findPackMatch, loadPackCandidates, type PackCandidate } from "@/lib/pack-match";
import {
  deriveStatuses,
  linkEntry,
  restoreFromPack,
  summarizeCampaign,
  unlinkEntry,
  type EntryRowLike,
} from "@/lib/pack-link-service";

const BADGE_VARIANT: Record<PackLinkState, "default" | "secondary" | "outline" | "destructive"> = {
  official: "default",
  modified: "secondary",
  custom: "outline",
  stale: "destructive",
};

function asRow(entry: CharacterEntry): EntryRowLike {
  return entry as unknown as EntryRowLike;
}

/** Derived state for every entry on the sheet; nothing is stored. */
export function usePackLinkStatuses(entries: CharacterEntry[], campaignSettings: unknown) {
  const key = entries.map((entry) => `${entry.id}:${JSON.stringify(entry.source ?? {})}`).join("|");
  return useQuery({
    queryKey: ["pack-link-status", key, JSON.stringify(campaignSettings ?? null)],
    queryFn: () => deriveStatuses(supabase, entries.map(asRow), campaignSettings),
    enabled: entries.length > 0,
    staleTime: 30_000,
  });
}

export function PackStateBadge({
  status,
  entry,
  campaignSettings,
  characterId,
  canEdit,
}: {
  status: PackLinkStatus | undefined;
  entry: CharacterEntry;
  campaignSettings: unknown;
  characterId: string;
  canEdit: boolean;
}) {
  const { t } = useT("characters");
  const queryClient = useQueryClient();
  const [pickerOpen, setPickerOpen] = useState(false);
  const state = status?.state ?? "custom";

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["entries", characterId] });
    void queryClient.invalidateQueries({ queryKey: ["pack-link-status"] });
  };

  const restore = useMutation({
    mutationFn: () => restoreFromPack(supabase, asRow(entry), campaignSettings),
    onSuccess: () => {
      invalidate();
      toast.success(t("sheet.packLink.restored", { name: entry.name }));
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const unlink = useMutation({
    mutationFn: () => unlinkEntry(supabase, asRow(entry), campaignSettings),
    onSuccess: () => {
      invalidate();
      toast.success(t("sheet.packLink.unlinked", { name: entry.name }));
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const label = t(`sheet.packLink.state.${state}`);
  const reason = status?.stale_reason
    ? t(`sheet.packLink.reason.${status.stale_reason as StaleReason}`)
    : null;

  return (
    <>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={t("sheet.packLink.badgeAria", { name: entry.name, state: label })}
          >
            <Badge variant={BADGE_VARIANT[state]} className="ml-1 cursor-pointer">
              {label}
            </Badge>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-80 space-y-3" align="start">
          <div>
            <p className="text-sm font-medium">{entry.name}</p>
            <p className="text-xs text-muted-foreground">
              {status?.link?.pack_name
                ? t("sheet.packLink.fromPack", { pack: status.link.pack_name })
                : t("sheet.packLink.noPack")}
            </p>
            {reason ? <p className="mt-1 text-xs text-muted-foreground">{reason}</p> : null}
          </div>

          {status?.diff && status.diff.length ? (
            <ul className="space-y-1 text-xs">
              {status.diff.map((row) => (
                <li key={row.field} className="flex justify-between gap-2">
                  <span className="text-muted-foreground">
                    {t(`sheet.packLink.field.${row.field}`, { defaultValue: row.field })}
                  </span>
                  <span className="text-right font-mono">
                    {String(row.pack ?? "—")} → {String(row.character ?? "—")}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}

          {canEdit ? (
            <div className="flex flex-wrap gap-2">
              {state === "modified" || state === "stale" ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={restore.isPending}
                  onClick={() => restore.mutate()}
                >
                  {state === "stale"
                    ? t("sheet.packLink.actions.update")
                    : t("sheet.packLink.actions.restore")}
                </Button>
              ) : null}
              {status?.link ? (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={unlink.isPending}
                  onClick={() => unlink.mutate()}
                >
                  {t("sheet.packLink.actions.unlink")}
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={() => setPickerOpen(true)}>
                  {t("sheet.packLink.actions.link")}
                </Button>
              )}
            </div>
          ) : null}
        </PopoverContent>
      </Popover>

      <PackLinkPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        entry={entry}
        campaignSettings={campaignSettings}
        onLinked={invalidate}
      />
    </>
  );
}

/** Type-ahead picker over the pack items the sheet may actually use. */
export function PackLinkPicker({
  open,
  onOpenChange,
  entry,
  campaignSettings,
  onLinked,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  entry: CharacterEntry;
  campaignSettings: unknown;
  onLinked: () => void;
}) {
  const { t } = useT("characters");
  const [search, setSearch] = useState(entry.name);

  const results = useQuery({
    queryKey: ["pack-link-search", entry.kind, search, JSON.stringify(campaignSettings ?? null)],
    queryFn: () =>
      loadPackCandidates(supabase, {
        kind: entry.kind,
        search,
        campaignSettings,
        limit: 40,
      }),
    enabled: open && search.trim().length > 1,
  });

  const link = useMutation({
    mutationFn: (item: PackCandidate) =>
      linkEntry(supabase, asRow(entry), item, "ui_picker", campaignSettings),
    onSuccess: () => {
      onLinked();
      onOpenChange(false);
      toast.success(t("sheet.packLink.linked", { name: entry.name }));
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("sheet.packLink.picker.title")}</DialogTitle>
          <DialogDescription>{t("sheet.packLink.picker.description")}</DialogDescription>
        </DialogHeader>
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          aria-label={t("sheet.packLink.picker.searchAria")}
          placeholder={t("sheet.packLink.picker.searchPlaceholder")}
        />
        <ul className="max-h-72 space-y-1 overflow-y-auto">
          {(results.data ?? []).map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                disabled={link.isPending}
                onClick={() => link.mutate(item)}
              >
                <span className="truncate">{item.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {item.pack_name ?? item.pack ?? ""}
                </span>
              </button>
            </li>
          ))}
          {results.isFetched && (results.data ?? []).length === 0 ? (
            <li className="px-2 py-1.5 text-sm text-muted-foreground">
              {t("sheet.packLink.picker.empty")}
            </li>
          ) : null}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

interface Proposal {
  entry: CharacterEntry;
  item: PackCandidate | null;
  status: "unique" | "ambiguous" | "none";
}

/** Bulk linking: always previews first, and only writes on confirmation. */
export function BulkLinkDialog({
  open,
  onOpenChange,
  entries,
  statuses,
  campaignSettings,
  onDone,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  entries: CharacterEntry[];
  statuses: Map<string, PackLinkStatus> | undefined;
  campaignSettings: unknown;
  onDone: () => void;
}) {
  const { t } = useT("characters");
  const unlinked = useMemo(
    () => entries.filter((entry) => (statuses?.get(entry.id)?.state ?? "custom") === "custom"),
    [entries, statuses],
  );

  const preview = useQuery({
    queryKey: ["pack-link-bulk", unlinked.map((entry) => entry.id).join(",")],
    enabled: open && unlinked.length > 0,
    queryFn: async (): Promise<Proposal[]> => {
      const out: Proposal[] = [];
      for (const entry of unlinked) {
        const result = await findPackMatch(
          supabase,
          { kind: entry.kind, name: entry.name, category: entry.category },
          { campaignSettings },
        );
        out.push({ entry, item: result.item, status: result.status });
      }
      return out;
    },
  });

  const apply = useMutation({
    mutationFn: async () => {
      const proposals = (preview.data ?? []).filter((row) => row.status === "unique" && row.item);
      for (const row of proposals) {
        await linkEntry(supabase, asRow(row.entry), row.item!, "match_name", campaignSettings);
      }
      return proposals.length;
    },
    onSuccess: (count) => {
      onDone();
      onOpenChange(false);
      toast.success(t("sheet.packLink.bulk.done", { count }));
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const matched = (preview.data ?? []).filter((row) => row.status === "unique").length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("sheet.packLink.bulk.title")}</DialogTitle>
          <DialogDescription>{t("sheet.packLink.bulk.description")}</DialogDescription>
        </DialogHeader>
        <ul className="max-h-72 space-y-1 overflow-y-auto text-sm">
          {(preview.data ?? []).map((row) => (
            <li key={row.entry.id} className="flex items-center justify-between gap-2">
              <span className="truncate">{row.entry.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {row.status === "unique"
                  ? (row.item?.pack_name ?? row.item?.pack ?? "")
                  : t(`sheet.packLink.bulk.${row.status}`)}
              </span>
            </li>
          ))}
          {preview.isFetched && (preview.data ?? []).length === 0 ? (
            <li className="text-muted-foreground">{t("sheet.packLink.bulk.empty")}</li>
          ) : null}
        </ul>
        <DialogFooter>
          <Button
            disabled={matched === 0 || apply.isPending}
            onClick={() => apply.mutate()}
          >
            {t("sheet.packLink.bulk.confirm", { count: matched })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Game Master overview: per-character counts for the whole campaign. */
export function CampaignPackSummary({ campaignId }: { campaignId: string }) {
  const { t } = useT("characters");
  const summary = useQuery({
    queryKey: ["pack-link-summary", campaignId],
    queryFn: () => summarizeCampaign(supabase, campaignId),
  });
  const rows = summary.data ?? [];
  if (rows.length === 0) return null;

  return (
    <section className="panel p-4">
      <h2 className="font-display text-sm font-semibold uppercase tracking-widest text-muted-foreground">
        {t("sheet.packLink.summary.title")}
      </h2>
      <ul className="mt-3 space-y-1 text-sm">
        {rows.map((row) => (
          <li key={row.character_id} className="flex items-center justify-between gap-2">
            <span className="truncate">{row.name}</span>
            <span className="shrink-0 font-mono text-xs text-muted-foreground">
              {t("sheet.packLink.summary.counts", {
                official: row.official,
                modified: row.modified,
                custom: row.custom,
                stale: row.stale,
              })}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
