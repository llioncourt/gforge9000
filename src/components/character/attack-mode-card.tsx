/**
 * Presentation for one normalized attack mode. All calculation lives in
 * `src/rules/weapons.ts`; this component only renders resolved state and
 * refuses to offer rolls for values the engine could not resolve.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
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

function field<T>(label: string, parsed: Parsed<T>, format: (v: T) => string) {
  if (parsed.status === "unconfigured") return null;
  const value =
    parsed.status === "resolved" && parsed.value !== null
      ? format(parsed.value)
      : `${parsed.raw ?? ""} (unresolved)`;
  return <Meta key={label} label={label} value={value} />;
}

export function AttackModeCard({
  weapon,
  target,
  onAttack,
  onDamage,
}: {
  weapon: NormalizedWeapon;
  target: number;
  onAttack: () => void;
  onDamage: (expression: string) => void;
}) {
  const [ammo, setAmmo] = useState<AmmoState | null>(weapon.ammo);
  const rollable = weapon.damage.status === "rollable";

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-muted/20 p-3 text-sm">
      <span className="font-medium">{weapon.name}</span>
      <span className="font-mono text-muted-foreground">
        {weapon.damage.status === "rollable"
          ? `${weapon.damage.expression}${weapon.damage.damageType ? ` ${weapon.damage.damageType}` : ""}`
          : weapon.damage.status === "unconfigured"
            ? "No damage"
            : `${weapon.damage.raw} — not configured`}
      </span>
      {field("Reach", weapon.reach, (r) =>
        [r.close ? "C" : null, ...r.distances.map(String)].filter(Boolean).join(","),
      )}
      {field("Parry", weapon.parry, (p) => (p === "none" ? "No" : String(p)))}
      {field("Acc", weapon.accuracy, String)}
      {field("Range", weapon.range, (r) => (r.short ? `${r.short}/${r.max}` : String(r.max)))}
      {field("RoF", weapon.rof, (r) =>
        r.multiProjectile ? `${r.shotsPerAttack}x${r.projectilesPerShot}` : String(r.shotsPerAttack),
      )}
      {field("Bulk", weapon.bulk, String)}
      {field("Rcl", weapon.recoil, String)}
      {ammo ? (
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          Shots
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
              if (result.ok) setAmmo(result.state);
            }}
          >
            Fire
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2"
            disabled={ammo.current >= ammo.capacity}
            onClick={() => setAmmo(reloadAmmo(ammo))}
          >
            Reload
          </Button>
        </span>
      ) : weapon.shots.status === "unresolved" ? (
        <Meta label="Shots" value={`${weapon.shots.raw} (unresolved)`} />
      ) : null}
      <div className="ml-auto flex gap-2">
        <Button size="sm" onClick={onAttack}>
          Attack {target}
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
            Damage
          </Button>
        ) : (
          <span className="self-center text-xs text-muted-foreground">
            Damage: not configured
          </span>
        )}
      </div>
    </div>
  );
}
