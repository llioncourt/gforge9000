import { z } from "zod";

import { PROVENANCE_TYPES } from "@/lib/adaptation/types";

/**
 * Output contracts for the AI reconstruction pipeline.
 *
 * Every stage returns strict JSON validated against one of these schemas. A
 * response that fails validation is retried; it is never written to the
 * database half-parsed, and it never touches campaign canon.
 */

export const AI_STAGES = [
  "digest",
  "facts",
  "conflicts",
  "chronology",
  "scenes",
  "enrichment",
] as const;
export type AiStage = (typeof AI_STAGES)[number];

export const digestSchema = z.object({
  summary: z.string(),
  key_threads: z.array(z.string()),
  open_questions: z.array(z.string()),
});

export const factsSchema = z.object({
  facts: z.array(
    z.object({
      subject: z.string(),
      subject_source_key: z.string().nullable(),
      fact_type: z.string(),
      statement: z.string(),
      provenance_type: z.enum(PROVENANCE_TYPES),
      source_keys: z.array(z.string()),
      confidence: z.number().min(0).max(1),
      gm_only: z.boolean(),
    }),
  ),
});

export const conflictsSchema = z.object({
  conflicts: z.array(
    z.object({
      statement: z.string(),
      conflicting_statements: z.array(z.string()),
      source_keys: z.array(z.string()),
      explanation: z.string(),
    }),
  ),
});

export const chronologySchema = z.object({
  ordered: z.array(
    z.object({
      label: z.string(),
      source_keys: z.array(z.string()),
      order: z.number().int().min(0),
      in_world_hint: z.string().nullable(),
      certainty: z.enum(["certain", "likely", "unknown"]),
    }),
  ),
});

export const scenesSchema = z.object({
  scenes: z.array(
    z.object({
      title: z.string(),
      synopsis: z.string(),
      dramatic_goal: z.string(),
      sequence_no: z.number().int().min(0),
      source_keys: z.array(z.string()),
      cast: z.array(z.string()),
      location: z.string().nullable(),
      props: z.array(z.string()),
      beats: z.array(
        z.object({
          order: z.number().int().min(0),
          description: z.string(),
          emotion: z.string().nullable(),
          actors: z.array(z.string()),
        }),
      ),
      dialogue: z.array(
        z.object({
          order: z.number().int().min(0),
          speaker: z.string(),
          line: z.string(),
          delivery: z.string().nullable(),
          balloon_type: z.string(),
        }),
      ),
      narration: z.array(
        z.object({ order: z.number().int().min(0), text: z.string(), placement: z.string() }),
      ),
      continuity: z.array(z.object({ key: z.string(), value: z.string() })),
      provenance_type: z.enum(PROVENANCE_TYPES),
      gm_only: z.boolean(),
    }),
  ),
});

export const enrichmentSchema = z.object({
  /** Everything here is invented for the adaptation and is tagged as such. */
  additions: z.array(
    z.object({
      scene_title: z.string(),
      kind: z.enum(["wardrobe", "set_dressing", "transition", "visual_motif", "sensory"]),
      description: z.string(),
    }),
  ),
  story_bible: z.object({
    logline: z.string(),
    synopsis: z.string(),
    themes: z.array(z.string()),
    tone: z.string(),
    genre: z.array(z.string()),
    setting: z.string(),
  }),
});

export const STAGE_SCHEMAS = {
  digest: digestSchema,
  facts: factsSchema,
  conflicts: conflictsSchema,
  chronology: chronologySchema,
  scenes: scenesSchema,
  enrichment: enrichmentSchema,
} as const;

export type StageResult<S extends AiStage> = z.infer<(typeof STAGE_SCHEMAS)[S]>;

/** JSON Schema sent to the model, mirroring the Zod contracts above. */
export const STAGE_JSON_SCHEMAS: Record<AiStage, Record<string, unknown>> = {
  digest: obj({
    summary: str(),
    key_threads: arr(str()),
    open_questions: arr(str()),
  }),
  facts: obj({
    facts: arr(
      obj({
        subject: str(),
        subject_source_key: nullableStr(),
        fact_type: str(),
        statement: str(),
        provenance_type: enumOf(PROVENANCE_TYPES),
        source_keys: arr(str()),
        confidence: { type: "number" },
        gm_only: { type: "boolean" },
      }),
    ),
  }),
  conflicts: obj({
    conflicts: arr(
      obj({
        statement: str(),
        conflicting_statements: arr(str()),
        source_keys: arr(str()),
        explanation: str(),
      }),
    ),
  }),
  chronology: obj({
    ordered: arr(
      obj({
        label: str(),
        source_keys: arr(str()),
        order: { type: "integer" },
        in_world_hint: nullableStr(),
        certainty: enumOf(["certain", "likely", "unknown"]),
      }),
    ),
  }),
  scenes: obj({
    scenes: arr(
      obj({
        title: str(),
        synopsis: str(),
        dramatic_goal: str(),
        sequence_no: { type: "integer" },
        source_keys: arr(str()),
        cast: arr(str()),
        location: nullableStr(),
        props: arr(str()),
        beats: arr(
          obj({
            order: { type: "integer" },
            description: str(),
            emotion: nullableStr(),
            actors: arr(str()),
          }),
        ),
        dialogue: arr(
          obj({
            order: { type: "integer" },
            speaker: str(),
            line: str(),
            delivery: nullableStr(),
            balloon_type: str(),
          }),
        ),
        narration: arr(obj({ order: { type: "integer" }, text: str(), placement: str() })),
        continuity: arr(obj({ key: str(), value: str() })),
        provenance_type: enumOf(PROVENANCE_TYPES),
        gm_only: { type: "boolean" },
      }),
    ),
  }),
  enrichment: obj({
    additions: arr(
      obj({
        scene_title: str(),
        kind: enumOf(["wardrobe", "set_dressing", "transition", "visual_motif", "sensory"]),
        description: str(),
      }),
    ),
    story_bible: obj({
      logline: str(),
      synopsis: str(),
      themes: arr(str()),
      tone: str(),
      genre: arr(str()),
      setting: str(),
    }),
  }),
};

function obj(properties: Record<string, unknown>): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: Object.keys(properties),
    properties,
  };
}
function arr(items: unknown): Record<string, unknown> {
  return { type: "array", items };
}
function str(): Record<string, unknown> {
  return { type: "string" };
}
function nullableStr(): Record<string, unknown> {
  return { type: ["string", "null"] };
}
function enumOf(values: readonly string[]): Record<string, unknown> {
  return { type: "string", enum: [...values] };
}
