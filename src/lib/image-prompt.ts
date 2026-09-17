export interface ImagePromptInput {
  name: string;
  concept?: string | null;
  techLevel?: number | null;
  appearance?: Record<string, string | undefined> | null;
  traits?: string[];
  gear?: string[];
}

const APPEARANCE_ORDER: [string, string][] = [
  ["age", "Age"],
  ["height", "Height"],
  ["weight", "Weight"],
  ["build", "Build"],
  ["hair", "Hair"],
  ["eyes", "Eyes"],
];

/**
 * Builds a deterministic, template-based image-generation prompt from a
 * character sheet. No AI involved — the same sheet always yields the same
 * prompt. CONFIGURABLE: wording is a fixed house template, not copied from
 * any source text.
 */
export function buildImagePrompt(input: ImagePromptInput): string {
  const parts: string[] = [];

  const who = [input.name.trim() || "a character", input.concept?.trim()]
    .filter(Boolean)
    .join(", ");
  parts.push(`Full-body character concept art of ${who}.`);

  const appearance = (input.appearance ?? {}) as Record<string, string | undefined>;
  const details = APPEARANCE_ORDER.map(([key, label]) => {
    const value = appearance[key]?.trim();
    return value ? `${label}: ${value}` : null;
  }).filter((v): v is string => Boolean(v));
  if (details.length > 0) parts.push(`Appearance — ${details.join("; ")}.`);

  const traits = (input.traits ?? [])
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 8);
  if (traits.length > 0) parts.push(`Notable traits: ${traits.join(", ")}.`);

  const gear = (input.gear ?? [])
    .map((g) => g.trim())
    .filter(Boolean)
    .slice(0, 8);
  if (gear.length > 0) parts.push(`Equipment and weapons: ${gear.join(", ")}.`);

  if (input.techLevel != null) parts.push(`Tech level ${input.techLevel} setting.`);

  parts.push(
    "Style: detailed digital painting, cinematic lighting, neutral muted background, sharp focus, high quality character portrait.",
  );

  return parts.join(" ");
}
