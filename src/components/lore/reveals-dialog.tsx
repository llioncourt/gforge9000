import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Search, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EntityThumb } from "@/components/lore/entity-thumb";
import { useFormatters, useT } from "@/i18n/hooks";
import { kindDef } from "@/lib/entity-kinds";
import { listCampaignGrants, listEntities } from "@/lib/lore";
import { buildRevealList, matchesRevealSearch, type RevealItem } from "@/lib/reveal-list";
import { cn } from "@/lib/utils";

/**
 * Sheet-side button that gathers everything the GM has revealed to the
 * character's player — records revealed to that player specifically and
 * records visible to every player — and opens each one in place, so nothing
 * navigates away from the sheet.
 *
 * Only player-facing text is ever shown (summary and player description),
 * including when the GM opens a player's sheet: the list is "what this player
 * can see", never the GM's own notes.
 */
export function RevealsButton({
  campaignId,
  playerId,
}: {
  campaignId: string;
  /** The player the sheet belongs to. */
  playerId: string | null | undefined;
}) {
  const { t } = useT("lore");
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={() => setOpen(true)}
        aria-label={t("revealsDialog.buttonAria")}
        title={t("revealsDialog.buttonAria")}
      >
        <Sparkles className="h-4 w-4" />
        {t("revealsDialog.button")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("revealsDialog.title")}</DialogTitle>
            <DialogDescription>{t("revealsDialog.description")}</DialogDescription>
          </DialogHeader>
          {/* Mounted only while open, so the sheet itself loads nothing extra. */}
          {open ? <RevealsList campaignId={campaignId} playerId={playerId} /> : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function RevealsList({
  campaignId,
  playerId,
}: {
  campaignId: string;
  playerId: string | null | undefined;
}) {
  const { t } = useT("lore");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  // Same reads (and cache) as the campaign's Reveals board.
  const entities = useQuery({
    queryKey: ["lore-entities", campaignId],
    queryFn: () => listEntities(campaignId),
  });
  const grants = useQuery({
    queryKey: ["lore-grants", campaignId],
    queryFn: () => listCampaignGrants(campaignId),
  });

  const list = useMemo(
    () => buildRevealList(entities.data ?? [], grants.data ?? [], playerId),
    [entities.data, grants.data, playerId],
  );
  const forPlayer = list.forPlayer.filter((item) => matchesRevealSearch(item, search));
  const forEveryone = list.forEveryone.filter((item) => matchesRevealSearch(item, search));
  const total = list.forPlayer.length + list.forEveryone.length;

  if (entities.isLoading || grants.isLoading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((index) => (
          <Skeleton key={index} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (entities.isError || grants.isError) {
    return <p className="text-sm text-destructive">{t("revealsDialog.loadFailed")}</p>;
  }

  if (total === 0) {
    return (
      <p className="rounded-lg border border-border p-6 text-center text-sm text-muted-foreground">
        {t("revealsDialog.empty")}
      </p>
    );
  }

  const toggle = (id: string) => setOpenId((current) => (current === id ? null : id));

  return (
    <>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-8"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("revealsDialog.searchPlaceholder")}
          aria-label={t("revealsDialog.searchPlaceholder")}
        />
      </div>
      <div className="-mr-2 min-h-0 flex-1 space-y-5 overflow-y-auto pr-2">
        {forPlayer.length ? (
          <RevealSection
            title={t("revealsDialog.sections.player", { count: forPlayer.length })}
            items={forPlayer}
            openId={openId}
            onToggle={toggle}
          />
        ) : null}
        {forEveryone.length ? (
          <RevealSection
            title={t("revealsDialog.sections.everyone", { count: forEveryone.length })}
            items={forEveryone}
            openId={openId}
            onToggle={toggle}
          />
        ) : null}
        {forPlayer.length + forEveryone.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t("revealsDialog.noMatches")}
          </p>
        ) : null}
      </div>
    </>
  );
}

function RevealSection({
  title,
  items,
  openId,
  onToggle,
}: {
  title: string;
  items: RevealItem[];
  openId: string | null;
  onToggle: (id: string) => void;
}) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        {title}
      </h3>
      {items.map((item) => (
        <RevealRow
          key={item.entity.id}
          item={item}
          open={openId === item.entity.id}
          onToggle={() => onToggle(item.entity.id)}
        />
      ))}
    </section>
  );
}

function RevealRow({
  item,
  open,
  onToggle,
}: {
  item: RevealItem;
  open: boolean;
  onToggle: () => void;
}) {
  const { t } = useT("lore");
  const { t: tc } = useT("common");
  const f = useFormatters();
  const { entity } = item;
  const name = entity.name || tc("labels.untitled");
  const panelId = `reveal-${entity.id}`;
  const body = entity.player_description?.trim();
  const summary = entity.summary?.trim();

  return (
    <div className={cn("rounded-lg border border-border", open && "border-primary/50")}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-start gap-3 rounded-lg p-3 text-left transition-colors hover:bg-accent/30"
      >
        <EntityThumb path={entity.image_url} entityId={entity.id} name={name} className="size-12" />
        <span className="min-w-0 flex-1">
          <span className="flex items-start justify-between gap-2">
            <span className="truncate font-medium">{name}</span>
            <ChevronDown
              className={cn(
                "mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform",
                open && "rotate-180",
              )}
            />
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className="text-[10px] uppercase">
              {kindDef(entity.kind).label}
            </Badge>
            {item.revealedAt ? (
              <span className="text-xs text-muted-foreground">
                {t("playersPanel.revealedOn", { date: f.date(item.revealedAt) })}
              </span>
            ) : null}
          </span>
          {!open && summary ? (
            <span className="mt-1.5 line-clamp-2 block text-sm text-muted-foreground">
              {summary}
            </span>
          ) : null}
        </span>
      </button>
      {open ? (
        <div id={panelId} className="space-y-3 border-t border-border p-3 text-sm">
          {entity.image_url ? (
            <EntityThumb
              path={entity.image_url}
              entityId={entity.id}
              name={name}
              className="size-40"
            />
          ) : null}
          {summary ? <p className="whitespace-pre-wrap font-medium">{summary}</p> : null}
          {body ? <p className="whitespace-pre-wrap text-muted-foreground">{body}</p> : null}
          {item.note ? (
            <p className="whitespace-pre-wrap rounded-md border border-border bg-muted/30 p-2 text-xs">
              <span className="font-semibold">{t("revealsDialog.gmNote")}</span> {item.note}
            </p>
          ) : null}
          {!summary && !body && !item.note ? (
            <p className="text-muted-foreground">{t("revealsDialog.noText")}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
