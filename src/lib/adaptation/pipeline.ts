import { normalizeText } from "@/lib/text-normalize";
import { runAdaptationStage } from "@/lib/adaptation/ai.functions";
import type { AiStage, StageResult } from "@/lib/adaptation/ai-schemas";
import { hashValue, stableKey } from "@/lib/adaptation/hash";
import type { ScanRecord, ScanSnapshot } from "@/lib/adaptation/scanner";
import { deriveKnowledgeState } from "@/lib/adaptation/spoilers";
import type { ProvenanceType, SourceRef, SpoilerPolicy } from "@/lib/adaptation/types";
import { allowedBySpoilerPolicy } from "@/lib/adaptation/spoilers";

/**
 * Pipeline orchestration.
 *
 * The chunking and the mapping from model output to draft rows are pure, so
 * they can be tested without the network; only `runReconstruction` talks to the
 * server function.
 */

/**
 * Small batches on purpose: one oversized batch keeps a single request open for
 * many minutes, which reads as a run that never ends. Several small batches run
 * side by side instead.
 */
export const DEFAULT_CHUNK_CHARS = 12_000;

/** How many batches are sent at the same time. */
export const CHUNK_CONCURRENCY = 3;

/** Runs tasks with a bounded number in flight, preserving result order. */
async function mapWithLimit<T, R>(
  items: T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await task(items[index] as T, index);
    }
  });
  await Promise.all(workers);
  return results;
}

export interface ContextChunk {
  index: number;
  total: number;
  text: string;
  source_keys: string[];
}

/** Renders one scanned record as labelled text the model can cite by key. */
export function renderRecord(sourceKey: string, record: ScanRecord): string {
  const body = Object.entries(record.payload)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(([key, value]) => `  ${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`)
    .join("\n");
  return `[${sourceKey}] ${record.source_type} — ${record.label}${record.gm_only ? " (GM ONLY)" : ""}\n${body}`;
}

/**
 * Records that already say when they happened are ordered here, not guessed
 * at: a session number beats a play date, a play date beats an in-world year,
 * and anything undated keeps its scan order behind the dated material.
 */
export function chronologyRank(record: ScanRecord): number | null {
  const payload = record.payload as Record<string, unknown>;
  const session = Number(payload["session_no"]);
  if (Number.isFinite(session)) return session;
  const played = typeof payload["played_on"] === "string" ? Date.parse(payload["played_on"]) : NaN;
  if (Number.isFinite(played)) return played / 1e9;
  const data = (payload["data"] ?? {}) as Record<string, unknown>;
  const year = Number(payload["year"] ?? data["year"]);
  if (Number.isFinite(year)) return year;
  return null;
}

/** Splits a snapshot into chunks that fit comfortably in one request. */
export function buildContextChunks(
  snapshot: ScanSnapshot,
  spoilerPolicy: SpoilerPolicy,
  maxChars = DEFAULT_CHUNK_CHARS,
): ContextChunk[] {
  const blocks: { key: string; text: string; rank: number | null; order: number }[] = [];
  for (const source of snapshot.sources) {
    const record = snapshot.records[source.source_key];
    if (!record) continue;
    const allowed = allowedBySpoilerPolicy(
      spoilerPolicy,
      { revealed: !record.gm_only },
      record.gm_only,
    );
    if (!allowed) continue;
    blocks.push({
      key: source.source_key,
      text: renderRecord(source.source_key, record),
      rank: chronologyRank(record),
      order: blocks.length,
    });
  }
  blocks.sort((a, b) => {
    if (a.rank !== null && b.rank !== null && a.rank !== b.rank) return a.rank - b.rank;
    if (a.rank !== null && b.rank === null) return -1;
    if (a.rank === null && b.rank !== null) return 1;
    return a.order - b.order;
  });

  const chunks: ContextChunk[] = [];
  let current: { key: string; text: string }[] = [];
  let size = 0;
  const flush = () => {
    if (!current.length) return;
    chunks.push({
      index: chunks.length,
      total: 0,
      text: current.map((block) => block.text).join("\n\n"),
      source_keys: current.map((block) => block.key),
    });
    current = [];
    size = 0;
  };

  for (const block of blocks) {
    if (size + block.text.length > maxChars && current.length) flush();
    current.push(block);
    size += block.text.length;
  }
  flush();
  return chunks.map((chunk) => ({ ...chunk, total: chunks.length || 1 }));
}

export interface DraftFact {
  stable_key: string;
  subject_entity_id: string | null;
  fact_type: string;
  statement: string;
  provenance_type: ProvenanceType;
  source_refs: SourceRef[];
  confidence: number;
  canon_status: "needs_review";
  conflict_with: string[];
  knowledge_scope: Record<string, unknown>;
  gm_only: boolean;
}

/** Turns a validated `facts` stage result into reviewable draft rows. */
export function toDraftFacts(result: StageResult<"facts">, snapshot: ScanSnapshot): DraftFact[] {
  return result.facts.map((fact) => {
    const refs = sourceRefs(fact.source_keys, snapshot);
    const entityId = entityIdFor(fact.subject_source_key, snapshot);
    const record = fact.subject_source_key ? snapshot.records[fact.subject_source_key] : undefined;
    return {
      stable_key: stableKey("fact", fact.subject, fact.statement),
      subject_entity_id: entityId,
      fact_type: fact.fact_type || "general",
      statement: fact.statement,
      provenance_type: fact.provenance_type,
      source_refs: refs,
      confidence: fact.confidence,
      canon_status: "needs_review" as const,
      conflict_with: [],
      knowledge_scope: deriveKnowledgeState({
        visibility: (record?.payload["visibility"] as string | undefined) ?? null,
        gmOnly: fact.gm_only,
        grantedUserIds: (record?.payload["grants"] as string[] | undefined) ?? [],
      }) as unknown as Record<string, unknown>,
      gm_only: fact.gm_only,
    };
  });
}

/** Marks the facts named in a `conflicts` result so the review screen can group them. */
export function applyConflicts(facts: DraftFact[], result: StageResult<"conflicts">): DraftFact[] {
  const byStatement = new Map(facts.map((fact) => [fact.statement.trim(), fact]));
  for (const conflict of result.conflicts) {
    const primary = byStatement.get(conflict.statement.trim());
    const others = conflict.conflicting_statements
      .map((statement) => byStatement.get(statement.trim()))
      .filter((fact): fact is DraftFact => !!fact);
    for (const fact of [primary, ...others].filter((f): f is DraftFact => !!f)) {
      fact.provenance_type = "conflict";
      fact.conflict_with = [
        ...new Set([
          ...fact.conflict_with,
          ...[primary, ...others]
            .filter((other): other is DraftFact => !!other && other !== fact)
            .map((other) => other.stable_key),
        ]),
      ];
    }
  }
  return facts;
}

export interface DraftScene {
  stable_key: string;
  sequence_no: number;
  title: string;
  synopsis: string;
  dramatic_goal: string;
  story_beats: unknown[];
  dialogue: unknown[];
  narration: unknown[];
  cast_entity_ids: string[];
  location_entity_id: string | null;
  prop_entity_ids: string[];
  wardrobe_refs: unknown[];
  continuity_state: Record<string, unknown>;
  knowledge_state: Record<string, unknown>;
  source_refs: SourceRef[];
  provenance_type: ProvenanceType;
  review_status: "needs_review";
  content_hash: string;
  gm_only: boolean;
}

/** Turns a validated `scenes` stage result into reviewable draft rows. */
export function toDraftScenes(
  result: StageResult<"scenes">,
  snapshot: ScanSnapshot,
  offset = 0,
): DraftScene[] {
  const byName = entityIndex(snapshot);
  return result.scenes
    .slice()
    .sort((a, b) => a.sequence_no - b.sequence_no)
    .map((scene, index) => {
      const refs = sourceRefs(scene.source_keys, snapshot);
      const body = {
        title: scene.title,
        synopsis: scene.synopsis,
        beats: scene.beats,
        dialogue: scene.dialogue,
        narration: scene.narration,
      };
      return {
        stable_key: stableKey("scene", scene.title, scene.source_keys.join(",")),
        sequence_no: offset + index,
        title: scene.title,
        synopsis: scene.synopsis,
        dramatic_goal: scene.dramatic_goal,
        story_beats: scene.beats.map((beat) => ({
          order: beat.order,
          description: beat.description,
          emotion: beat.emotion,
          entity_ids: beat.actors
            .map((actor) => byName.get(normalizeText(actor)) ?? "")
            .filter(Boolean),
        })),
        dialogue: scene.dialogue.map((line) => ({
          order: line.order,
          speaker: line.speaker,
          speaker_entity_id: byName.get(normalizeText(line.speaker)) ?? null,
          line: line.line,
          delivery: line.delivery,
          balloon_type: line.balloon_type || "balloon",
        })),
        narration: scene.narration,
        cast_entity_ids: scene.cast
          .map((name) => byName.get(normalizeText(name)))
          .filter((id): id is string => !!id),
        location_entity_id: scene.location
          ? (byName.get(normalizeText(scene.location)) ?? null)
          : null,
        prop_entity_ids: scene.props
          .map((name) => byName.get(normalizeText(name)))
          .filter((id): id is string => !!id),
        wardrobe_refs: [],
        continuity_state: Object.fromEntries(scene.continuity.map((c) => [c.key, c.value])),
        knowledge_state: deriveKnowledgeState({ gmOnly: scene.gm_only }) as unknown as Record<
          string,
          unknown
        >,
        source_refs: refs,
        provenance_type: scene.provenance_type,
        review_status: "needs_review" as const,
        content_hash: hashValue(body),
        gm_only: scene.gm_only,
      };
    });
}

function entityIndex(snapshot: ScanSnapshot): Map<string, string> {
  const index = new Map<string, string>();
  for (const [, record] of Object.entries(snapshot.records)) {
    if (record.source_type !== "entity" || !record.source_id) continue;
    index.set(normalizeText(record.label), record.source_id);
    for (const alias of (record.payload["aliases"] as string[] | undefined) ?? []) {
      index.set(normalizeText(alias), record.source_id);
    }
  }
  return index;
}

function entityIdFor(sourceKey: string | null, snapshot: ScanSnapshot): string | null {
  if (!sourceKey) return null;
  const record = snapshot.records[sourceKey];
  return record?.source_type === "entity" ? record.source_id : null;
}

function sourceRefs(keys: string[], snapshot: ScanSnapshot): SourceRef[] {
  const refs: SourceRef[] = [];
  for (const key of keys) {
    const record = snapshot.records[key];
    if (!record) continue;
    refs.push({
      source_type: record.source_type,
      source_key: key,
      source_id: record.source_id,
      label: record.label,
    });
  }
  return refs;
}

export interface PipelineProgress {
  stage: AiStage;
  chunk: number;
  chunks: number;
  label: string;
  /** Batches finished so far and the total planned, for a truthful bar. */
  done: number;
  total: number;
}

export interface ReconstructionResult {
  digest: StageResult<"digest">[];
  facts: DraftFact[];
  scenes: DraftScene[];
  enrichment: StageResult<"enrichment"> | null;
  failures: { stage: AiStage; chunk: number; message: string }[];
}

/**
 * Runs the whole pipeline. A failing chunk is recorded and the run continues,
 * so one bad batch never throws away the rest of the work.
 */
export async function runReconstruction(
  adaptationId: string,
  snapshot: ScanSnapshot,
  options: { spoilerPolicy: SpoilerPolicy; instructions?: string },
  onProgress?: (progress: PipelineProgress) => void,
): Promise<ReconstructionResult> {
  const chunks = buildContextChunks(snapshot, options.spoilerPolicy);
  const out: ReconstructionResult = {
    digest: [],
    facts: [],
    scenes: [],
    enrichment: null,
    failures: [],
  };

  // digest + facts, conflicts, chronology + scenes, enrichment.
  const total = chunks.length * 4 + 2;
  let done = 0;

  const call = async <S extends AiStage>(
    stage: S,
    context: string,
    chunkIndex: number,
    chunkTotal: number,
  ): Promise<StageResult<S> | null> => {
    onProgress?.({ stage, chunk: chunkIndex + 1, chunks: chunkTotal, label: stage, done, total });
    try {
      const response = (await runAdaptationStage({
        data: {
          adaptation_id: adaptationId,
          stage,
          context,
          chunk_index: chunkIndex,
          chunk_total: chunkTotal,
          ...(options.instructions ? { instructions: options.instructions } : {}),
        },
      })) as { result: string };
      return JSON.parse(response.result) as StageResult<S>;
    } catch (error) {
      out.failures.push({ stage, chunk: chunkIndex, message: (error as Error).message });
      return null;
    } finally {
      done += 1;
      onProgress?.({ stage, chunk: chunkIndex + 1, chunks: chunkTotal, label: stage, done, total });
    }
  };

  // A. digest + B. fact extraction, several batches at a time.
  const extracted = await mapWithLimit(chunks, CHUNK_CONCURRENCY, async (chunk) => {
    const digest = await call("digest", chunk.text, chunk.index, chunk.total);
    const facts = await call("facts", chunk.text, chunk.index, chunk.total);
    return { digest, facts };
  });
  for (const entry of extracted) {
    if (entry.digest) out.digest.push(entry.digest);
    if (entry.facts) out.facts.push(...toDraftFacts(entry.facts, snapshot));
  }

  // C. conflict detection over the extracted facts.
  if (out.facts.length) {
    const statements = out.facts.map((fact) => `- ${fact.statement}`).join("\n");
    const conflicts = await call("conflicts", statements, 0, 1);
    if (conflicts) out.facts = applyConflicts(out.facts, conflicts);
  } else {
    done += 1;
  }

  // D. chronology + E. scene reconstruction, several batches at a time.
  // Records that state when they happened are already in order; the ordering
  // step only runs for material that genuinely has no dates to go on.
  const staged = await mapWithLimit(chunks, CHUNK_CONCURRENCY, async (chunk) => {
    const dated = chunk.source_keys.every((key) => {
      const record = snapshot.records[key];
      return record ? chronologyRank(record) !== null : false;
    });
    const chronology = dated
      ? null
      : await call("chronology", chunk.text, chunk.index, chunk.total);
    if (dated) done += 1;
    const context = chronology
      ? `${chunk.text}\n\n--- SUGGESTED ORDER ---\n${JSON.stringify(chronology.ordered)}`
      : chunk.text;
    return call("scenes", context, chunk.index, chunk.total);
  });
  let offset = 0;
  for (const scenes of staged) {
    if (!scenes) continue;
    const drafts = toDraftScenes(scenes, snapshot, offset);
    offset += drafts.length;
    out.scenes.push(...drafts);
  }

  // F. enrichment.
  if (out.scenes.length) {
    const outline = out.scenes
      .map((scene) => `${scene.sequence_no}. ${scene.title} — ${scene.synopsis}`)
      .join("\n");
    out.enrichment = await call("enrichment", outline, 0, 1);
  } else {
    done += 1;
  }

  onProgress?.({
    stage: "enrichment",
    chunk: 1,
    chunks: 1,
    label: "enrichment",
    done: total,
    total,
  });
  return out;
}
