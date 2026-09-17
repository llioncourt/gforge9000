import { useQuery } from "@tanstack/react-query";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/i18n/hooks";
import { listEntities } from "@/lib/lore";
import { listSessionChronicles } from "@/lib/adaptation/chronicle-api";
import { SOURCE_MODES, SPOILER_POLICIES, type SourceMode, type SpoilerPolicy } from "@/lib/adaptation/types";
import type { StepProps } from "@/components/adaptation/adaptation-wizard";
import type { ScanScope } from "@/lib/adaptation/scanner";

const SCOPE_MODES = ["whole", "branch", "entities", "sessions"] as const;
type ScopeMode = (typeof SCOPE_MODES)[number];

export function SourceStep({ project, patch }: StepProps) {
  const { t } = useT("adaptation");
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h4 className="font-display text-base font-semibold">{t("source.title")}</h4>
        <p className="text-sm text-muted-foreground">{t("source.description")}</p>
      </header>

      <div className="space-y-3">
        <Label>{t("source.modeLabel")}</Label>
        <RadioGroup
          value={project.source_mode}
          onValueChange={(value) => void patch({ source_mode: value as SourceMode })}
          className="space-y-2"
        >
          {SOURCE_MODES.map((mode) => (
            <div key={mode} className="flex items-start gap-3">
              <RadioGroupItem value={mode} id={`mode-${mode}`} className="mt-1" />
              <Label htmlFor={`mode-${mode}`} className="font-normal leading-snug">
                {t(`source.modes.${mode}`)}
              </Label>
            </div>
          ))}
        </RadioGroup>
      </div>

      <div className="space-y-3">
        <Label>{t("source.targetsLabel")}</Label>
        <div className="flex items-center gap-3">
          <Checkbox
            id="target-comic"
            checked={project.target_comic}
            onCheckedChange={(checked) => void patch({ target_comic: checked === true })}
          />
          <Label htmlFor="target-comic" className="font-normal">
            {t("source.targetComic")}
          </Label>
        </div>
        <div className="flex items-center gap-3">
          <Checkbox
            id="target-movie"
            checked={project.target_movie}
            onCheckedChange={(checked) => void patch({ target_movie: checked === true })}
          />
          <Label htmlFor="target-movie" className="font-normal">
            {t("source.targetMovie")}
          </Label>
        </div>
      </div>
    </div>
  );
}

export function ScopeStep({ project, patch }: StepProps) {
  const { t } = useT("adaptation");
  const scope = (project.source_scope ?? {}) as ScanScope & { mode?: ScopeMode };
  const mode: ScopeMode = scope.mode ?? "whole";

  const entities = useQuery({
    queryKey: ["lore-entities", project.campaign_id],
    queryFn: () => listEntities(project.campaign_id),
  });
  const chronicles = useQuery({
    queryKey: ["session-chronicles", project.campaign_id],
    queryFn: () => listSessionChronicles(project.campaign_id),
  });

  const setScope = (next: Partial<ScanScope & { mode?: ScopeMode }>) =>
    void patch({ source_scope: { ...scope, ...next } as Record<string, unknown> });

  const toggleId = (key: "entity_ids" | "root_entity_ids" | "session_chronicle_ids", id: string) => {
    const list = new Set((scope[key] as string[] | undefined) ?? []);
    if (list.has(id)) list.delete(id);
    else list.add(id);
    setScope({ [key]: [...list] } as Partial<ScanScope>);
  };

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h4 className="font-display text-base font-semibold">{t("scope.title")}</h4>
        <p className="text-sm text-muted-foreground">{t("scope.description")}</p>
      </header>

      <div className="space-y-3">
        <Label>{t("scope.scopeLabel")}</Label>
        <RadioGroup
          value={mode}
          onValueChange={(value) => setScope({ mode: value as ScopeMode })}
          className="space-y-2"
        >
          {SCOPE_MODES.map((value) => (
            <div key={value} className="flex items-center gap-3">
              <RadioGroupItem value={value} id={`scope-${value}`} />
              <Label htmlFor={`scope-${value}`} className="font-normal">
                {t(`scope.scopeModes.${value}`)}
              </Label>
            </div>
          ))}
        </RadioGroup>
      </div>

      {mode === "branch" || mode === "entities" ? (
        <div className="space-y-2">
          <Label>{mode === "branch" ? t("scope.branchLabel") : t("scope.entitiesLabel")}</Label>
          {mode === "branch" ? (
            <p className="text-xs text-muted-foreground">{t("scope.branchHint")}</p>
          ) : null}
          {entities.isLoading ? (
            <Skeleton className="h-40 w-full rounded-lg" />
          ) : entities.data?.length ? (
            <ScrollArea className="h-48 rounded-lg border p-3">
              <div className="space-y-2">
                {entities.data.map((entity) => {
                  const key = mode === "branch" ? "root_entity_ids" : "entity_ids";
                  const list = (scope[key] as string[] | undefined) ?? [];
                  return (
                    <div key={entity.id} className="flex items-center gap-3">
                      <Checkbox
                        id={`${key}-${entity.id}`}
                        checked={list.includes(entity.id)}
                        onCheckedChange={() => toggleId(key, entity.id)}
                      />
                      <Label htmlFor={`${key}-${entity.id}`} className="font-normal">
                        {entity.name}
                      </Label>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          ) : (
            <p className="text-sm text-muted-foreground">{t("scope.noEntities")}</p>
          )}
        </div>
      ) : null}

      {mode === "sessions" ? (
        <div className="space-y-3">
          <Label>{t("scope.sessionRangeLabel")}</Label>
          <div className="flex gap-3">
            <div className="space-y-1">
              <Label htmlFor="session-from" className="text-xs font-normal text-muted-foreground">
                {t("scope.sessionFrom")}
              </Label>
              <Input
                id="session-from"
                type="number"
                className="w-28"
                value={scope.session_range?.from ?? ""}
                onChange={(event) =>
                  setScope({
                    session_range: {
                      ...scope.session_range,
                      from: event.target.value ? Number(event.target.value) : null,
                    },
                  })
                }
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="session-to" className="text-xs font-normal text-muted-foreground">
                {t("scope.sessionTo")}
              </Label>
              <Input
                id="session-to"
                type="number"
                className="w-28"
                value={scope.session_range?.to ?? ""}
                onChange={(event) =>
                  setScope({
                    session_range: {
                      ...scope.session_range,
                      to: event.target.value ? Number(event.target.value) : null,
                    },
                  })
                }
              />
            </div>
          </div>

          <Label>{t("scope.chroniclesLabel")}</Label>
          {chronicles.isLoading ? (
            <Skeleton className="h-24 w-full rounded-lg" />
          ) : chronicles.data?.length ? (
            <div className="space-y-2 rounded-lg border p-3">
              {chronicles.data.map((chronicle) => (
                <div key={chronicle.id} className="flex items-center gap-3">
                  <Checkbox
                    id={`chronicle-${chronicle.id}`}
                    checked={(scope.session_chronicle_ids ?? []).includes(chronicle.id)}
                    onCheckedChange={() => toggleId("session_chronicle_ids", chronicle.id)}
                  />
                  <Label htmlFor={`chronicle-${chronicle.id}`} className="font-normal">
                    {chronicle.title}
                  </Label>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t("scope.noChronicles")}</p>
          )}
        </div>
      ) : null}

      <div className="space-y-3">
        <Label>{t("scope.spoilerLabel")}</Label>
        <RadioGroup
          value={project.spoiler_policy}
          onValueChange={(value) => void patch({ spoiler_policy: value as SpoilerPolicy })}
          className="space-y-2"
        >
          {SPOILER_POLICIES.map((policy) => (
            <div key={policy} className="flex items-start gap-3">
              <RadioGroupItem value={policy} id={`policy-${policy}`} className="mt-1" />
              <Label htmlFor={`policy-${policy}`} className="font-normal leading-snug">
                {t(`scope.spoilerPolicies.${policy}`)}
              </Label>
            </div>
          ))}
        </RadioGroup>
      </div>

      <div className="space-y-3">
        <Label>{t("scope.includeLabel")}</Label>
        {(
          [
            ["include_characters", "includeCharacters"],
            ["include_assets", "includeAssets"],
            ["include_maps", "includeMaps"],
            ["include_media", "includeMedia"],
          ] as const
        ).map(([key, label]) => (
          <div key={key} className="flex items-center gap-3">
            <Checkbox
              id={key}
              checked={scope[key] !== false}
              onCheckedChange={(checked) => setScope({ [key]: checked === true } as Partial<ScanScope>)}
            />
            <Label htmlFor={key} className="font-normal">
              {t(`scope.${label}`)}
            </Label>
          </div>
        ))}
      </div>
    </div>
  );
}
