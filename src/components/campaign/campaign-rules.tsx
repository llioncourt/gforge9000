import { useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useT } from "@/i18n/hooks";
import { defaultRuleset, type Ruleset } from "@/rules";
import {
  RULESET_FIELDS,
  RULESET_GROUPS,
  changedPaths,
  coerceFieldValue,
  getAtPath,
  overridesFromRuleset,
  rulesetFromSettings,
  setAtPath,
  type RulesetField,
  type RulesetGroup,
} from "@/rules/campaign-ruleset";

function formatValue(value: unknown, unlimited: string): string {
  if (value === null || value === undefined) return unlimited;
  if (typeof value === "boolean") return value ? "✓" : "—";
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(2);
  return String(value);
}

export function CampaignRules({
  settings,
  disabled,
  onSave,
}: {
  settings: Record<string, unknown>;
  disabled: boolean;
  onSave: (overrides: Partial<Ruleset>) => void;
}) {
  const { t } = useT("campaigns");
  const [rules, setRules] = useState<Ruleset>(() => rulesetFromSettings(settings));
  const changed = useMemo(() => new Set(changedPaths(rules)), [rules]);
  const unlimited = t("rulesTuning.unlimited");

  const setField = (field: RulesetField, raw: string | boolean) => {
    const value = coerceFieldValue(field, raw);
    if (value === null && field.kind !== "nullableInteger") return;
    setRules((prev) => setAtPath(prev, field.path, value));
  };
  const resetField = (field: RulesetField) =>
    setRules((prev) => setAtPath(prev, field.path, getAtPath(defaultRuleset, field.path)));

  const byGroup = (group: RulesetGroup) => RULESET_FIELDS.filter((f) => f.group === group);

  const renderControl = (field: RulesetField) => {
    const value = getAtPath(rules, field.path);
    if (field.kind === "boolean") {
      return (
        <Switch
          checked={value === true}
          disabled={disabled}
          onCheckedChange={(v) => setField(field, v)}
          aria-label={fieldLabel(field)}
        />
      );
    }
    if (field.kind === "enum") {
      return (
        <Select
          value={String(value)}
          disabled={disabled}
          onValueChange={(v) => setField(field, v)}
        >
          <SelectTrigger aria-label={fieldLabel(field)}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(field.options ?? []).map((option) => (
              <SelectItem key={option} value={option}>
                {t(`rulesTuning.enums.${field.path}.${option}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    return (
      <Input
        type="number"
        inputMode="decimal"
        step={field.step ?? 1}
        value={value === null || value === undefined ? "" : String(value)}
        placeholder={field.kind === "nullableInteger" ? unlimited : undefined}
        disabled={disabled}
        aria-label={fieldLabel(field)}
        onChange={(e) => setField(field, e.target.value)}
      />
    );
  };

  function fieldLabel(field: RulesetField): string {
    return t(`rulesTuning.fields.${field.path}`);
  }

  const renderFieldRow = (field: RulesetField) => (
    <div key={field.path} className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs">{fieldLabel(field)}</Label>
        {changed.has(field.path) && !disabled ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            title={t("rulesTuning.reset")}
            aria-label={t("rulesTuning.reset")}
            onClick={() => resetField(field)}
          >
            <RotateCcw className="h-3 w-3" />
          </Button>
        ) : null}
      </div>
      {renderControl(field)}
      <p className="text-[11px] text-muted-foreground">
        {t("rulesTuning.defaultValue", {
          value: formatValue(getAtPath(defaultRuleset, field.path), unlimited),
        })}
      </p>
    </div>
  );

  const renderRowTable = (
    group: RulesetGroup,
    rowLabels: string[],
    columns: { suffix: string; header: string }[],
    prefix: (index: number) => string,
  ) => (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-widest text-muted-foreground">
            <th className="pb-1 pr-2 font-medium">{t("rulesTuning.columns.row")}</th>
            {columns.map((c) => (
              <th key={c.suffix} className="pb-1 pr-2 font-medium">
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rowLabels.map((label, index) => (
            <tr key={`${group}-${index}`}>
              <td className="py-1 pr-2 text-xs text-muted-foreground">{label}</td>
              {columns.map((c) => {
                const path = `${prefix(index)}.${c.suffix}`;
                const field = RULESET_FIELDS.find((f) => f.path === path);
                if (!field) return <td key={c.suffix} />;
                return (
                  <td key={c.suffix} className="py-1 pr-2">
                    <Input
                      type="number"
                      step={field.step ?? 1}
                      className="h-8 w-24"
                      value={String(getAtPath(rules, path) ?? "")}
                      disabled={disabled}
                      aria-label={`${label} — ${c.header}`}
                      onChange={(e) => setField(field, e.target.value)}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <section className="space-y-5">
      <div>
        <Label>{t("rulesTuning.title")}</Label>
        <p className="mt-1 text-xs text-muted-foreground">{t("rulesTuning.hint")}</p>
      </div>

      {RULESET_GROUPS.map((group) => (
        <div key={group} className="space-y-2 rounded-lg border border-border p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            {t(`rulesTuning.groups.${group}`)}
          </p>
          {group === "encumbrance" ? (
            renderRowTable(
              group,
              rules.encumbrance.map((tier) => tier.label),
              [
                { suffix: "multiplier", header: t("rulesTuning.columns.multiplier") },
                { suffix: "moveFactor", header: t("rulesTuning.columns.moveFactor") },
                { suffix: "dodgePenalty", header: t("rulesTuning.columns.dodgePenalty") },
              ],
              (i) => `encumbrance.${i}`,
            )
          ) : group === "health" ? (
            <div className="space-y-4">
              {(["hpThresholds", "fpThresholds"] as const).map((key) => (
                <div key={key} className="space-y-1">
                  <p className="text-xs text-muted-foreground">{t(`rulesTuning.columns.${key}`)}</p>
                  {renderRowTable(
                    group,
                    rules.health[key].map((row) => row.label),
                    [
                      { suffix: "atOrBelow", header: t("rulesTuning.columns.atOrBelow") },
                      { suffix: "moveFactor", header: t("rulesTuning.columns.moveFactor") },
                    ],
                    (i) => `health.${key}.${i}`,
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {byGroup(group).map(renderFieldRow)}
            </div>
          )}
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={disabled} onClick={() => onSave(overridesFromRuleset(rules))}>
          {t("rulesTuning.save")}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={disabled || changed.size === 0}
          onClick={() => setRules(defaultRuleset)}
        >
          {t("rulesTuning.resetAll")}
        </Button>
        <span className="text-xs text-muted-foreground">
          {t("rulesTuning.changedCount", { count: changed.size })}
        </span>
      </div>
    </section>
  );
}
