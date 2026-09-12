import type { CharacterRow } from "@/lib/api";
import type { CharacterEntry, CharacterSheet } from "@/rules";
import { PortraitFrame } from "@/components/character/portrait";

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
  const appearance = (character.appearance ?? {}) as Record<string, string>;
  const traits = entries.filter((e) =>
    ["advantage", "perk", "custom", "language", "culture"].includes(e.kind),
  );
  const drawbacks = entries.filter((e) => ["disadvantage", "quirk"].includes(e.kind));
  const gear = entries.filter((e) => e.kind === "equipment");

  return (
    <div className="print-sheet">
      <header className="print-head">
        <div className="print-head-main">
          <h1 className="print-title">{character.name || "Unnamed character"}</h1>
          <p className="print-sub">
            {[character.concept, character.player_name ? `Player: ${character.player_name}` : null]
              .filter(Boolean)
              .join(" · ") || "—"}
          </p>
          <table className="print-table print-identity">
            <tbody>
              <tr>
                <th>Points</th>
                <td>
                  {sheet.points.total} / {character.point_budget}
                </td>
                <th>TL</th>
                <td>{character.tech_level}</td>
                <th>Wealth</th>
                <td>{character.wealth}</td>
                <th>Status</th>
                <td>{character.status}</td>
              </tr>
              <tr>
                <th>Age</th>
                <td>{appearance["age"] ?? ""}</td>
                <th>Height</th>
                <td>{appearance["height"] ?? ""}</td>
                <th>Weight</th>
                <td>{appearance["weight"] ?? ""}</td>
                <th>Build</th>
                <td>{appearance["build"] ?? ""}</td>
              </tr>
              <tr>
                <th>Hair</th>
                <td>{appearance["hair"] ?? ""}</td>
                <th>Eyes</th>
                <td>{appearance["eyes"] ?? ""}</td>
                <th>Hand</th>
                <td>{appearance["handedness"] ?? ""}</td>
                <th>Type</th>
                <td>{character.is_npc ? "NPC" : "PC"}</td>
              </tr>
            </tbody>
          </table>

          <div className="print-stat-row">
            {(
              [
                ["ST", sheet.stats.st],
                ["DX", sheet.stats.dx],
                ["IQ", sheet.stats.iq],
                ["HT", sheet.stats.ht],
                ["HP", sheet.stats.hp],
                ["Will", sheet.stats.will],
                ["Per", sheet.stats.per],
                ["FP", sheet.stats.fp],
                ["Speed", sheet.stats.basicSpeed.toFixed(2)],
                ["Move", sheet.encumbrance.effectiveMove],
                ["Dodge", sheet.encumbrance.effectiveDodge],
                ["BL", sheet.stats.basicLift],
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
          <PortraitFrame url={portraitUrl} name={character.name || "Character"} eager />
          <p className="print-portrait-caption">Portrait</p>
        </div>
      </header>

      <section className="print-cols">
        <PrintTable
          title="Advantages, perks & background"
          head={["Trait", "Lv", "Pts"]}
          rows={traits.map((e) => [e.name, String(e.levels), String(e.points * Math.max(1, e.levels))])}
        />
        <PrintTable
          title="Disadvantages & quirks"
          head={["Trait", "Lv", "Pts"]}
          rows={drawbacks.map((e) => [
            e.name,
            String(e.levels),
            String(e.points * Math.max(1, e.levels)),
          ])}
        />
      </section>

      <PrintTable
        title="Skills, techniques & abilities"
        head={["Name", "Kind", "Relative", "Pts", "Level"]}
        rows={sheet.skills.map(({ entry, level }) => [
          entry.name +
            (entry.data["specialization"] ? ` (${String(entry.data["specialization"])})` : ""),
          entry.kind,
          level.label,
          String(Number(entry.data["points"] ?? 0)),
          String(level.effective ?? "—"),
        ])}
      />

      <PrintTable
        title={`Equipment — carried ${sheet.encumbrance.carriedWeight} · total ${sheet.encumbrance.totalWeight} · ${sheet.encumbrance.label}`}
        head={["Item", "Qty", "Weight", "Cost", "DR", "State"]}
        rows={gear.map((e) => [
          e.name,
          String(Number(e.data["quantity"] ?? 1)),
          String(Number(e.data["weight"] ?? 0)),
          String(Number(e.data["cost"] ?? 0)),
          String(Number(e.data["dr"] ?? 0) || "—"),
          e.data["carried"] === false ? "Stored" : "Carried",
        ])}
      />

      <section className="print-cols">
        <div className="print-block">
          <h2 className="print-h2">Condition</h2>
          <table className="print-table">
            <tbody>
              <tr>
                <th>Current HP</th>
                <td>
                  {character.current_hp ?? sheet.stats.hp} / {sheet.stats.hp}
                </td>
                <th>Current FP</th>
                <td>
                  {character.current_fp ?? sheet.stats.fp} / {sheet.stats.fp}
                </td>
              </tr>
              <tr>
                <th>Conditions</th>
                <td colSpan={3}>{(character.conditions ?? []).join(", ") || "—"}</td>
              </tr>
              <tr>
                <th>Basic damage</th>
                <td colSpan={3}>
                  {sheet.damage.status === "configured"
                    ? `thrust ${sheet.damage.thrust} · swing ${sheet.damage.swing}`
                    : "not configured"}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="print-block">
          <h2 className="print-h2">DR by location</h2>
          <table className="print-table">
            <tbody>
              {Object.keys(sheet.dr).length === 0 ? (
                <tr>
                  <td>No worn armour.</td>
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
        <h2 className="print-h2">Notes</h2>
        <p className="print-notes">{character.notes || " "}</p>
      </div>

      <footer className="print-footer">
        Universal Character Forge — unofficial, independent companion tool. GURPS is a trademark of
        Steve Jackson Games Incorporated; this sheet is not affiliated with or endorsed by them.
      </footer>
    </div>
  );
}

function PrintTable({
  title,
  head,
  rows,
}: {
  title: string;
  head: string[];
  rows: string[][];
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
              <td colSpan={head.length}>—</td>
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
