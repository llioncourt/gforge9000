/**
 * Presentation for one normalized attack mode. All calculation lives in
 * `src/rules/weapons.ts`; this component only renders resolved state and
 * refuses to offer rolls for values the engine could not resolve.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/hooks";
import {
  consumeShots,
  reloadAmmo,
  type AmmoState,
  type NormalizedWeapon,
  type Parsed,
} from "@/rules";

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <span className="text-xs text-muted-foreground">
      {label} <span className="font-mono text-foreground">{value}</span>
    </span>
  );
}

function field<T>(
  label: string,
  parsed: Parsed<T>,
  format: (v: T) => string,
  unresolved: (raw: string) => string,
) {
  if (parsed.status === "unconfigured") return null;
  const value =
    parsed.status === "resolved" && parsed.value !== null
      ? format(parsed.value)
      : unresolved(parsed.raw ?? "");
  return <Meta key={label} label={label} value={value} />;
}

export function AttackModeCard({
  weapon,
  target,
  onAttack,
  onDamage,
  persistAmmo,
}: {
  weapon: NormalizedWeapon;
  target: number;
  onAttack: () => void;
  onDamage: (expression: string) => void;
  /** Persists current shots; the card reverts optimistically on failure. */
  persistAmmo?: (current: number) => Promise<void>;
}) {
  const { t } = useT("characters");
  const [ammo, setAmmo] = useState<AmmoState | null>(weapon.ammo);

  // Optimistic update with rollback; never mutates the weapon definition.
  const applyAmmo = (next: AmmoState, previous: AmmoState) => {
    setAmmo(next);
    if (!persistAmmo) return;
    void persistAmmo(next.current).catch(() => setAmmo(previous));
  };
  const rollable = weapon.damage.status === "rollable";

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-muted/20 p-3 text-sm">
      <span className="font-medium">{weapon.name}</span>
      <span className="font-mono text-muted-foreground">
        {weapon.damage.status === "rollable"
          ? `${weapon.damage.expression}${weapon.damage.damageType ? ` ${weapon.damage.damageType}` : ""}`
          : weapon.damage.status === "unconfigured"
            ? t("sheet.attack.noDamage")
            : t("sheet.attack.notConfigured", { raw: weapon.damage.raw })}
      </span>
      {field(
        t("sheet.entryDialog.weaponFields.reach"),
        weapon.reach,
        (r) => [r.close ? "C" : null, ...r.distances.map(String)].filter(Boolean).join(","),
        (raw) => t("sheet.attack.unresolved", { raw }),
      )}
      {field(
        t("sheet.entryDialog.weaponFields.parry"),
        weapon.parry,
        (p) => (p === "none" ? "No" : String(p)),
        (raw) => t("sheet.attack.unresolved", { raw }),
      )}
      {field(t("sheet.entryDialog.weaponFields.acc"), weapon.accuracy, String, (raw) => t("sheet.attack.unresolved", { raw }))}
      {field(
        t("sheet.entryDialog.weaponFields.range"),
        weapon.range,
        (r) => (r.short ? `${r.short}/${r.max}` : String(r.max)),
        (raw) => t("sheet.attack.unresolved", { raw }),
      )}
      {field(
        t("sheet.entryDialog.weaponFields.rof"),
        weapon.rof,
        (r) =>
          r.multiProjectile ? `${r.shotsPerAttack}x${r.projectilesPerShot}` : String(r.shotsPerAttack),
        (raw) => t("sheet.attack.unresolved", { raw }),
      )}
      {field(t("sheet.entryDialog.weaponFields.bulk"), weapon.bulk, String, (raw) => t("sheet.attack.unresolved", { raw }))}
      {field(t("sheet.entryDialog.weaponFields.rcl"), weapon.recoil, String, (raw) => t("sheet.attack.unresolved", { raw }))}
      {ammo ? (
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          {t("sheet.attack.shots")}
          <span className="font-mono text-foreground">
            {ammo.current}/{ammo.capacity}
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2"
            disabled={ammo.current <= 0}
            onClick={() => {
              const result = consumeShots(ammo, 1);
              if (result.ok) applyAmmo(result.state, ammo);
            }}
          >
            {t("sheet.attack.fire")}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2"
            disabled={ammo.current >= ammo.capacity}
            onClick={() => applyAmmo(reloadAmmo(ammo), ammo)}
          >
            {t("sheet.attack.reload")}
          </Button>
        </span>
      ) : weapon.shots.status === "unresolved" ? (
        <Meta label={t("sheet.attack.shots")} value={t("sheet.attack.unresolved", { raw: weapon.shots.raw })} />
      ) : null}
      <div className="ml-auto flex gap-2">
        <Button size="sm" onClick={onAttack}>
          {t("sheet.attack.attackButton", { target })}
        </Button>
        {rollable ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              onDamage(
                weapon.damage.status === "rollable" ? weapon.damage.expression : "",
              )
            }
          >
            {t("sheet.attack.damageButton")}
          </Button>
        ) : (
          <span className="self-center text-xs text-muted-foreground">
            {t("sheet.attack.damageUnconfigured")}
          </span>
        )}
      </div>
    </div>
  );
}
