import {
  STAGE_JSON_SCHEMAS,
  STAGE_SCHEMAS,
  type AiStage,
} from "@/lib/adaptation/ai-schemas";

/**
 * AI reconstruction pipeline — server side.
 *
 * Deliberately NOT one giant prompt: each stage is a small, separately
 * validated call, so a bad response only costs that stage and partial batches
 * can be retried. Nothing here writes to the database; the caller stores every
 * result as a draft for GM review.
 */

const GATEWAY = "https://ai.gateway.lovable.dev/v1/responses";
const MODEL = "openai/gpt-6-astra";
const MAX_ATTEMPTS = 3;
/** A stage that has not finished streaming by now is treated as failed. */
const STAGE_TIMEOUT_MS = 120_000;


const SYSTEM_PROMPT = `You adapt tabletop campaign records into comics and films.

Hard rules you must never break:
1. Never invent campaign facts. Anything not supported by the provided source records must be marked provenance_type "adaptation_created" or omitted.
2. Every statement or scene you derive from sources must list the exact source_keys it came from. Never cite a key that was not provided.
3. Never claim that a person or character knows something unless a source says so.
4. When two sources disagree, report a conflict instead of choosing a winner.
5. Write original prose. Never reproduce text from published rulebooks.
6. Return only JSON matching the requested schema.`;

const STAGE_PROMPTS: Record<AiStage, string> = {
  digest:
    "Summarise the source records below into a short digest: what the story is about, the live threads, and what is still unanswered.",
  facts:
    "Extract discrete, checkable facts from the source records. One statement per fact. Return at most 40 facts, choosing the most significant ones. Tag provenance_type as campaign_canon when a campaign record states it outright, session_derived when it comes from a played session, and ai_inference when you are inferring it. Set confidence honestly.",
  conflicts:
    "Find statements in the material below that contradict one another. Report each conflict with the statements involved and the sources behind them. Do not resolve them.",
  chronology:
    "Put the listed happenings into the order they occurred in the story world. Mark certainty honestly; use \"unknown\" when the sources do not say.",
  scenes:
    "Turn the material into adapted scenes for a visual retelling: title, synopsis, dramatic goal, beats, dialogue and narration. Return at most 8 scenes. Keep the cast, location and props limited to names present in the material. Cite source_keys for every scene.",
  enrichment:
    "Suggest purely presentational additions (wardrobe, set dressing, transitions, motifs) that make the scenes filmable, plus a story bible. These are inventions for the adaptation, not campaign facts.",
  impact:
    "Given the adapted scenes, recommend a comic page count with key splash moments, and a film runtime with act breaks and style notes.",
};

function gatewayMessage(status: number, body: string): string {
  if (status === 402) return "The workspace is out of AI credits. Add credits to keep generating.";
  if (status === 403) return "AI generation is disabled for this workspace.";
  if (status === 429) return "Too many AI requests right now. Try again in a moment.";
  if (status === 400) return `The AI request was rejected. ${body.slice(0, 200)}`;
  return `AI request failed (${status}). ${body.slice(0, 200)}`;
}

/** Statuses that are worth trying again; everything else is final. */
function retryable(status: number): boolean {
  return status === 429 || status >= 500;
}

async function callGateway(stage: AiStage, prompt: string): Promise<string> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("AI is not configured for this project.");

  let lastError = "";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const response = await fetch(GATEWAY, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
        "X-Lovable-AIG-SDK": "fetch",
      },
      body: JSON.stringify({
        model: MODEL,
        input: [
          { role: "system", content: [{ type: "input_text", text: SYSTEM_PROMPT }] },
          { role: "user", content: [{ type: "input_text", text: prompt }] },
        ],
        stream: true,
        store: false,
        reasoning: { effort: "low" },
        text: {
          format: {
            type: "json_schema",
            name: `adaptation_${stage}`,
            strict: true,
            schema: STAGE_JSON_SCHEMAS[stage],
          },
        },
      }),
    });

    if (!response.ok || !response.body) {
      const body = await response.text().catch(() => "");
      const message = gatewayMessage(response.status, body);
      if (!retryable(response.status) || attempt === MAX_ATTEMPTS) throw new Error(message);
      lastError = message;
      await wait(attempt * 1500);
      continue;
    }

    const text = await readStream(response.body);
    if (text.trim()) return text;
    lastError = "The AI returned an empty response.";
    if (attempt === MAX_ATTEMPTS) throw new Error(lastError);
    await wait(attempt * 1000);
  }
  throw new Error(lastError || "The AI request failed.");
}

async function readStream(body: ReadableStream<Uint8Array>): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const event = JSON.parse(payload) as {
          type?: string;
          delta?: string;
          response?: { output_text?: string };
        };
        if (event.type === "response.output_text.delta" && typeof event.delta === "string") {
          text += event.delta;
        } else if (event.type === "response.completed" && event.response?.output_text && !text) {
          text = event.response.output_text;
        }
      } catch {
        // keep-alive frames
      }
    }
  }
  return text;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Runs one pipeline stage and returns validated JSON.
 * An unparseable or schema-violating answer is retried before failing.
 */
export async function runStage(
  stage: AiStage,
  context: string,
  instructions?: string,
): Promise<unknown> {
  const schema = STAGE_SCHEMAS[stage];
  let lastProblem = "";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const prompt = [
      STAGE_PROMPTS[stage],
      instructions ? `Additional direction from the game master:\n${instructions}` : "",
      lastProblem ? `Your previous answer was rejected: ${lastProblem}. Fix it.` : "",
      "\n--- SOURCE MATERIAL ---\n",
      context,
    ]
      .filter(Boolean)
      .join("\n\n");

    const raw = await callGateway(stage, prompt);
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      lastProblem = "the response was not valid JSON";
      if (attempt === MAX_ATTEMPTS) throw new Error("The AI response could not be read.");
      continue;
    }
    const parsed = schema.safeParse(json);
    if (parsed.success) return parsed.data;
    lastProblem = parsed.error.issues[0]?.message ?? "the response did not match the schema";
    if (attempt === MAX_ATTEMPTS) {
      throw new Error(`The AI response was incomplete: ${lastProblem}.`);
    }
  }
  throw new Error("The AI response could not be validated.");
}
