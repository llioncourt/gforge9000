# Rules fidelity audit

Source of truth: `src/rules/audit.ts` (machine-readable, exported as `RULES_AUDIT`).
This document is the human-readable rendering of the same data.

## Classification

| Status | Meaning |
| --- | --- |
| EXACT | Deterministic implementation from first principles, covered by tests, no free parameters. |
| CONFIGURABLE | Correct shape; numbers come from `defaultRuleset`, campaign overrides or user content packs. |
| APPROXIMATION | Deliberately simplified. Technical debt — must be visible, never disguised. |
| MISSING | Not implemented. UI must not imply the mechanic works. |

No proprietary tables, prose or source data are bundled. Where exact behaviour
depends on data we cannot ship, the mechanic is CONFIGURABLE with an empty
default and the UI reports it as unavailable.

## Current state

| Area | Rule | Status | Implementation |
| --- | --- | --- | --- |
| attributes | ST / DX / IQ / HT point costs | CONFIGURABLE | `attributes.ts:attributePoints` |
| secondary | HP, FP, Will, Per | CONFIGURABLE | `attributes.ts:deriveStats` |
| secondary | Basic Speed / Basic Move | CONFIGURABLE | `attributes.ts:deriveStats` |
| secondary | Basic Lift | CONFIGURABLE | `attributes.ts:basicLift` — `ST^2 / divisor`, fractional precision preserved (ST 11 -> 24.2) |
| points | Point totals and remaining budget | EXACT | `points.ts:computePoints` |
| traits | Levelled traits | EXACT | `points.ts:entryCost` |
| traits | Enhancements / limitations | CONFIGURABLE | `points.ts:modifiedCost` |
| skills | Levels by difficulty and points | CONFIGURABLE | `skills.ts:relativeLevel` |
| skills | Defaults | CONFIGURABLE | `skills.ts:parseDefaults`, `bestDefault` |
| skills | Techniques | CONFIGURABLE | `skills.ts:techniqueLevel` |
| equipment | Encumbrance thresholds, Move/Dodge | CONFIGURABLE | `equipment.ts:computeEncumbrance` |
| equipment | DR by hit location | CONFIGURABLE | `equipment.ts:drByLocation` — stacking policy `additive` (default) or `highest` |
| combat | Dodge / Parry / Block | CONFIGURABLE | `defenses.ts` |
| combat | Basic damage by ST | CONFIGURABLE (no data bundled) | `damage.ts:basicDamage` |
| combat | Current HP/FP thresholds | CONFIGURABLE | `health.ts` |
| combat | Weapon field parsing (reach, parry, Acc, bulk, range, RoF, shots, recoil) | CONFIGURABLE | `weapons.ts:normalizeWeaponMode` |
| combat | Weapon damage expression resolution | CONFIGURABLE | `weapons.ts:resolveDamageExpression` |
| combat | Shots / ammunition state | CONFIGURABLE | `weapons.ts:createAmmoState`, `consumeShots`, `reloadAmmo` |
| combat | Persisted ammunition between sessions | MISSING | none — needs a schema change, out of scope |
| combat | Rapid fire: RoF, recoil, additional hits | CONFIGURABLE | `weapons.ts:additionalHits` |
| combat | Accuracy / Aim and Bulk modifier hooks | CONFIGURABLE | `weapons.ts:accuracyModifier`, `bulkModifier` |
| dice | Generic dice expressions | EXACT | `dice.ts:parseDice` |
| dice | 3d6 success rolls and criticals | CONFIGURABLE | `dice.ts:resolveSuccess` |
| campaign | House-rule overrides and limits | CONFIGURABLE | `ruleset.ts:mergeRuleset`, `points.ts:checkLimits` |

## Changes made in this pass

1. **Removed the invented Basic Damage formula.** `basicDamage(st)` in
   `attributes.ts` produced original but fabricated thrust/swing values. It is
   replaced by `damage.ts`, a table lookup over a `DamageProgression` supplied
   by the ruleset. The default progression is `null`; `buildSheet()` then
   returns `{ status: "not-configured" }` and the sheet states damage is
   unavailable instead of showing a number.
2. **Skill defaults implemented.** Defaults were stored as free text and never
   used. They are now parsed, resolved against attributes and other skills, and
   a purchased skill is never worse than its best default.
3. **Techniques implemented.** Previously techniques only contributed points.
   They now compute a level from the base skill, the default penalty and bought
   levels, capped by the penalty, with configurable costs.
4. **Active defences.** Parry and Block existed only as free-text weapon fields.
   `defenses.ts` derives them from a skill level with configurable divisor,
   base and retreat bonus.
5. **Current HP/FP state.** `health.ts` classifies current HP/FP against
   configurable fraction thresholds and exposes them on the sheet.
6. **Modifier rounding and floor are configurable** rather than hardcoded
   `Math.round` and `-80`.
7. **Campaign overrides.** `mergeRuleset()` merges house rules over the default
   ruleset; `checkLimits()` reports budget, disadvantage, quirk and TL
   violations instead of silently ignoring them.

## Phase B changes (weapons)

8. **Weapon fields are parsed, not guessed.** `weapons.ts` turns unambiguous
   numeric forms (RoF, recoil, shots, range, reach, parry, Acc, bulk) into typed
   values. Anything ambiguous is returned as `unresolved` with the raw text kept
   so the sheet still shows what the user typed.
9. **Damage expressions resolve through the damage progression.** `thr`/`sw`
   expressions are only rollable when a progression is installed; otherwise the
   result is `unavailable` and the sheet shows "Damage: not configured" with no
   roll button. Damage type labels (`cr`, `imp`, …) are parsed out, not
   interpreted.
10. **Ammunition state is pure and session-local.** Shots are tracked separately
    from the weapon definition; consumption rejects non-positive, fractional and
    over-capacity amounts, and reload is capped at capacity. Persisting current
    shots would require a schema change and is recorded as MISSING.
11. **Rapid fire.** `additionalHits()` derives extra hits from the margin of
    success and recoil, capped by shots fired, ammunition on hand and an optional
    ruleset cap; it is explicitly unavailable without both recoil and RoF.
12. **DR stacking reclassified.** Additive layering is a policy, not a universal
    rule, so `drStacking` is now ruleset-driven and the audit entry is
    CONFIGURABLE rather than EXACT.

## Known gaps (do not paper over)

- Current ammunition is not persisted across sessions (no schema change in this
  phase): **MISSING**.
- Aiming time, bracing, shock, hit-location targeting and other maneuvers are
  not modelled; Accuracy and Bulk are exposed as hooks only.
- No damage progression, skill list, default table or trait catalogue is
  bundled. All such data must come from the user or a licensed pack.
- Free-text conditions on a character have no mechanical effect.
