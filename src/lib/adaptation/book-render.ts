import type { AdventureModuleProjection, BookNarrativeProjection } from "@/lib/adaptation/protocol";

/**
 * Readable drafts of the book projections. The JSON stays the source of truth;
 * these Markdown files are what an author or GM opens first. Structural labels
 * are kept in English because the package format is language-neutral.
 */

export function renderBookMarkdown(book: BookNarrativeProjection): string {
  const p = book.target_projection;
  const out: string[] = [`# ${p.front_matter.title}`];
  if (p.front_matter.subtitle) out.push(`## ${p.front_matter.subtitle}`);
  if (p.front_matter.logline) out.push(`> ${p.front_matter.logline}`);
  for (const chapter of p.chapters) {
    out.push(`\n## Chapter ${chapter.chapter_no}: ${chapter.title}\n`);
    for (const section of chapter.sections) {
      if (section.kind === "transition") {
        out.push(
          `<!-- transition to write (adaptation_created): ${section.paragraphs[0]?.writing_brief ?? ""} -->`,
        );
        continue;
      }
      for (const para of section.paragraphs) {
        if (para.kind === "dialogue")
          out.push(`— ${para.text}${para.speaker ? ` (${para.speaker})` : ""}`);
        else out.push(para.text);
      }
      out.push("\n* * *\n");
    }
  }
  if (p.dramatis_personae.length) {
    out.push("\n## Dramatis personae\n");
    for (const person of p.dramatis_personae)
      out.push(`- **${person.name}**${person.description ? ` — ${person.description}` : ""}`);
  }
  return out.join("\n\n");
}

export function renderAdventureModuleMarkdown(module: AdventureModuleProjection): string {
  const p = module.target_projection;
  const out: string[] = [
    `# ${p.front_matter.title}`,
    `*GURPS 4e adventure — ${p.front_matter.players_min}–${p.front_matter.players_max} players*`,
  ];
  out.push("## Introduction", p.introduction.gm_summary);
  out.push("## Background (GM only)", p.background.gm_truth);
  out.push("## Common knowledge", p.background.common_knowledge);
  if (p.hooks.length) out.push("## Hooks", ...p.hooks.map((h) => `- ${h.text}`));
  out.push("## Characters and NPCs");
  for (const npc of p.npcs) {
    out.push(`### ${npc.name} (${npc.role})`, npc.gm_notes);
    if (npc.gurps) {
      const g = npc.gurps;
      out.push(
        `ST ${g.st} DX ${g.dx} IQ ${g.iq} HT ${g.ht} · HP ${g.hp} Will ${g.will} Per ${g.per} FP ${g.fp} · Speed ${g.basic_speed} Move ${g.basic_move} Dodge ${g.dodge}`,
      );
    }
  }
  out.push("## Locations", ...p.locations.map((l) => `- **${l.name}** — ${l.player_description}`));
  for (const act of p.acts) {
    out.push(`## Act ${act.act_no}: ${act.title}`, act.summary);
    for (const key of act.encounter_keys) {
      const e = p.encounters.find((x) => x.key === key);
      if (!e) continue;
      out.push(`### ${e.title}`, `**GM:** ${e.gm_summary}`);
      if (e.player_framing) out.push(`**Read or paraphrase:** ${e.player_framing}`);
      if (e.objective) out.push(`**Objective:** ${e.objective}`);
      out.push(
        "**Routes:**",
        ...e.routes.map(
          (r) =>
            `- ${r.approach}${r.original_table ? " (as played at the original table — one option, not the answer)" : ""}: ${r.description}${r.suggested_skills.length ? ` — ${r.suggested_skills.join(", ")}` : ""}`,
        ),
      );
      if (e.clue_keys.length) out.push(`**Clues:** ${e.clue_keys.join(", ")}`);
    }
  }
  out.push("## Clues and revelations");
  for (const clue of p.clues)
    out.push(
      `- [${clue.audience}] ${clue.statement}${clue.if_missed ? ` — if missed: ${clue.if_missed}` : ""}`,
    );
  return out.filter(Boolean).join("\n\n");
}
