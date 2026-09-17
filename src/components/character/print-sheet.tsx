import type { CharacterRow } from "@/lib/api";
import type { CharacterEntry, CharacterSheet } from "@/rules";
import { PortraitFrame } from "@/components/character/portrait";
import { useT } from "@/i18n/hooks";

/**
 * Dedicated print-first character sheet: A4 portrait, grayscale, dense and
 * table-oriented. Original layout — no official form design is reproduced.
 */
export function PrintSheet({
  character,
  sheet,
  entries,
  portraitUrl,
}: {
  character: CharacterRow;
  sheet: CharacterSheet;
  entries: CharacterEntry[];
  portraitUrl: string | null;
}) {
  const { t } = useT("characters");
  const appearance = (character.appearance ?? {}) as Record<string, string>;
  const traits = entries.filter((e) =>
    ["advantage", "perk", "custom", "language", "culture"].includes(e.kind),
  );
  const drawbacks = entries.filter((e) => ["disadvantage", "quirk"].includes(e.kind));
  const gear = entries.filter((e) => e.kind === "equipment");

  const noValue = t("sheet.print.noValue");

  return (
    <div className="print-sheet">
      <header className="print-head">
        <div className="print-head-main">
          <h1 className="print-title">{character.name || t("sheet.print.unnamedCharacter")}</h1>
          <p className="print-sub">
            {[
              character.concept,
              character.player_name
                ? t("sheet.print.playerPrefix", { name: character.player_name })
                : null,
            ]
              .filter(Boolean)
              .join(" · ") || noValue}
          </p>
          <table className="print-table print-identity">
            <tbody>
              <tr>
                <th>{t("sheet.print.labels.points")}</th>
                <td>
                  {sheet.points.total} / {character.point_budget}
                </td>
                <th>{t("sheet.print.labels.tl")}</th>
                <td>{character.tech_level}</td>
                <th>{t("sheet.print.labels.wealth")}</th>
                <td>{character.wealth}</td>
                <th>{t("sheet.print.labels.status")}</th>
                <td>{character.status}</td>
              </tr>
              <tr>
                <th>{t("sheet.print.labels.age")}</th>
                <td>{appearance["age"] ?? ""}</td>
                <th>{t("sheet.print.labels.height")}</th>
                <td>{appearance["height"] ?? ""}</td>
                <th>{t("sheet.print.labels.weight")}</th>
                <td>{appearance["weight"] ?? ""}</td>
                <th>{t("sheet.print.labels.build")}</th>
                <td>{appearance["build"] ?? ""}</td>
              </tr>
              <tr>
                <th>{t("sheet.print.labels.hair")}</th>
                <td>{appearance["hair"] ?? ""}</td>
                <th>{t("sheet.print.labels.eyes")}</th>
                <td>{appearance["eyes"] ?? ""}</td>
                <th>{t("sheet.print.labels.hand")}</th>
                <td>{appearance["handedness"] ?? ""}</td>
                <th>{t("sheet.print.labels.type")}</th>
                <td>{character.is_npc ? t("sheet.print.npc") : t("sheet.print.pc")}</td>
              </tr>
            </tbody>
          </table>

          <div className="print-stat-row">
            {(
              [
                [t("sheet.stats.st"), sheet.stats.st],
                [t("sheet.stats.dx"), sheet.stats.dx],
                [t("sheet.stats.iq"), sheet.stats.iq],
                [t("sheet.stats.ht"), sheet.stats.ht],
                [t("sheet.stats.hp"), sheet.stats.hp],
                [t("sheet.stats.will"), sheet.stats.will],
                [t("sheet.stats.per"), sheet.stats.per],
                [t("sheet.stats.fp"), sheet.stats.fp],
                [t("sheet.stats.speed"), sheet.stats.basicSpeed.toFixed(2)],
                [t("sheet.stats.move"), sheet.encumbrance.effectiveMove],
                [t("sheet.stats.dodge"), sheet.encumbrance.effectiveDodge],
                [t("sheet.stats.bl"), sheet.stats.basicLift],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="print-stat">
                <span className="print-stat-label">{label}</span>
                <span className="print-stat-value">{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Reserved portrait box — kept even when no image exists. */}
        <div className="print-portrait">
          <PortraitFrame
            url={portraitUrl}
            name={character.name || t("sheet.print.portraitFallbackName")}
            eager
          />
          <p className="print-portrait-caption">{t("sheet.print.portraitCaption")}</p>
        </div>
      </header>

      <section className="print-cols">
        <PrintTable
          title={t("sheet.print.advantagesTitle")}
          head={[t("sheet.print.headTrait"), t("sheet.print.headLv"), t("sheet.print.headPts")]}
          rows={traits.map((e) => [
            e.name,
            String(e.levels),
            String(e.points * Math.max(1, e.levels)),
          ])}
          emptyLabel={noValue}
        />
        <PrintTable
          title={t("sheet.print.disadvantagesTitle")}
          head={[t("sheet.print.headTrait"), t("sheet.print.headLv"), t("sheet.print.headPts")]}
          rows={drawbacks.map((e) => [
            e.name,
            String(e.levels),
            String(e.points * Math.max(1, e.levels)),
          ])}
          emptyLabel={noValue}
        />
      </section>

      <PrintTable
        title={t("sheet.print.skillsTitle")}
        head={[
          t("sheet.print.headName"),
          t("sheet.print.headKind"),
          t("sheet.print.headRelative"),
          t("sheet.print.headPts"),
          t("sheet.print.headLevel"),
        ]}
        rows={sheet.skills.map(({ entry, level }) => [
          entry.name +
            (entry.data["specialization"] ? ` (${String(entry.data["specialization"])})` : ""),
          entry.kind,
          level.label,
          String(Number(entry.data["points"] ?? 0)),
          String(level.effective ?? noValue),
        ])}
        emptyLabel={noValue}
      />

      <PrintTable
        title={t("sheet.print.equipmentTitle", {
          carried: sheet.encumbrance.carriedWeight,
          total: sheet.encumbrance.totalWeight,
          label: sheet.encumbrance.label,
        })}
        head={[
          t("sheet.print.headItem"),
          t("sheet.print.headQty"),
          t("sheet.print.headWeight"),
          t("sheet.print.headCost"),
          t("sheet.print.headDr"),
          t("sheet.print.headState"),
        ]}
        rows={gear.map((e) => [
          e.name,
          String(Number(e.data["quantity"] ?? 1)),
          String(Number(e.data["weight"] ?? 0)),
          String(Number(e.data["cost"] ?? 0)),
          String(Number(e.data["dr"] ?? 0) || noValue),
          e.data["carried"] === false
            ? t("sheet.equipmentTable.stored")
            : t("sheet.equipmentTable.carried"),
        ])}
        emptyLabel={noValue}
      />

      <section className="print-cols">
        <div className="print-block">
          <h2 className="print-h2">{t("sheet.combat.conditionTitle")}</h2>
          <table className="print-table">
            <tbody>
              <tr>
                <th>{t("sheet.print.currentHpLabel")}</th>
                <td>
                  {character.current_hp ?? sheet.stats.hp} / {sheet.stats.hp}
                </td>
                <th>{t("sheet.print.currentFpLabel")}</th>
                <td>
                  {character.current_fp ?? sheet.stats.fp} / {sheet.stats.fp}
                </td>
              </tr>
              <tr>
                <th>{t("sheet.combat.conditionsLabel")}</th>
                <td colSpan={3}>{(character.conditions ?? []).join(", ") || noValue}</td>
              </tr>
              <tr>
                <th>{t("sheet.print.basicDamageLabel")}</th>
                <td colSpan={3}>
                  {sheet.damage.status === "configured"
                    ? t("sheet.print.damageConfigured", {
                        thrust: sheet.damage.thrust,
                        swing: sheet.damage.swing,
                      })
                    : t("sheet.print.notConfigured")}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="print-block">
          <h2 className="print-h2">{t("sheet.combat.drTitle")}</h2>
          <table className="print-table">
            <tbody>
              {Object.keys(sheet.dr).length === 0 ? (
                <tr>
                  <td>{t("sheet.combat.noArmour")}</td>
                </tr>
              ) : (
                Object.entries(sheet.dr).map(([loc, dr]) => (
                  <tr key={loc}>
                    <th>{loc}</th>
                    <td>{dr}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="print-block">
        <h2 className="print-h2">{t("sheet.print.notesTitle")}</h2>
        <p className="print-notes">{character.notes || " "}</p>
      </div>

      <footer className="print-footer">{t("sheet.print.disclaimer")}</footer>
    </div>
  );
}

function PrintTable({
  title,
  head,
  rows,
  emptyLabel,
}: {
  title: string;
  head: string[];
  rows: string[][];
  emptyLabel: string;
}) {
  return (
    <div className="print-block">
      <h2 className="print-h2">{title}</h2>
      <table className="print-table">
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={head.length}>{emptyLabel}</td>
            </tr>
          ) : (
            rows.map((r, i) => (
              <tr key={i}>
                {r.map((cell, j) => (
                  <td key={j}>{cell}</td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
