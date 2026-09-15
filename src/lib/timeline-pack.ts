/**
 * Timeline pack — a small ZIP with the format documentation (Markdown) and an
 * example events.json, plus the reader used by the timeline import button.
 *
 * Pure data + fflate; no React.
 */
import { strToU8, zipSync, unzipSync, strFromU8 } from "fflate";

export type TimelineEventInput = {
  name: string;
  year?: string;
  month?: string;
  day?: string;
  hour?: string;
  minute?: string;
  era?: string;
  status?: string;
  visibility?: "GM_ONLY" | "ALL_PLAYERS";
  summary?: string;
  what_happened?: string;
  consequences?: string;
  gm_truth?: string;
};

export const TIMELINE_EXAMPLE_JSON = JSON.stringify(
  {
    events: [
      {
        name: "A Queda da Torre de Vitral",
        year: "1042",
        month: "Mês das Tormentas",
        day: "12",
        hour: "3",
        minute: "2",
        era: "Terceira Era",
        status: "Historical",
        visibility: "ALL_PLAYERS",
        summary: "A torre ruiu durante a tempestade e a ordem se dispersou.",
        what_happened: "Um raio atingiu o pináculo e o vitral central estilhaçou.",
        consequences: "Os arquivos da ordem foram espalhados por três cidades.",
        gm_truth: "O raio foi provocado por dentro da própria torre.",
      },
      {
        name: "O Pacto das Névoas",
        year: "1043",
        month: "Mês das Névoas",
        day: "4",
        status: "Recent",
        visibility: "GM_ONLY",
        summary: "Um acordo secreto entre duas casas.",
      },
    ],
  },
  null,
  2,
);

export function buildTimelineReadme(): string {
  return `# Importação de eventos da timeline

Este pacote contém:

- \`events.json\` — exemplo com dois eventos.
- \`README.md\` — este documento.

Importe o \`events.json\` (ou o próprio ZIP) pelo botão **Importar eventos**
na aba Timeline da campanha. Os eventos são criados como entradas do tipo
*Timeline Event* em World & Lore.

## Formato

\`\`\`jsonc
{
  "events": [
    {
      "name": "A Queda da Torre de Vitral",   // obrigatório

      "year": "1042",                          // texto ou número
      "month": "Mês das Tormentas",            // nome do mês do calendário, ou número
      "day": "12",
      "hour": "3",                             // opcional
      "minute": "2",                           // opcional
      "era": "Terceira Era",                   // opcional (default: era do calendário)

      "status": "Historical",                  // Historical | Recent | Upcoming | Rumored
      "visibility": "ALL_PLAYERS",             // ALL_PLAYERS | GM_ONLY

      "summary": "Resumo curto mostrado na lista.",
      "what_happened": "O que aconteceu.",
      "consequences": "Consequências.",
      "gm_truth": "Só o mestre vê."
    }
  ]
}
\`\`\`

Também é aceito um arquivo que seja apenas a lista: \`[ { "name": "…" } ]\`.

## Observações

- \`month\` deve bater com o nome de um mês do calendário da campanha para que a
  ordenação e a validação de data funcionem; qualquer texto é aceito, mas o
  evento pode ficar fora de ordem.
- Datas são validadas contra o calendário do mundo (duração do mês, bissextos,
  subdivisão do dia). Um evento com data inválida é recusado e apontado no erro.
- Campos ausentes ficam vazios; nada é sobrescrito — a importação só cria eventos.
`;
}

export function buildTimelinePackZip(): Blob {
  const files = zipSync({
    "README.md": strToU8(buildTimelineReadme()),
    "events.json": strToU8(TIMELINE_EXAMPLE_JSON),
  });
  return new Blob([files as unknown as BlobPart], { type: "application/zip" });
}

function str(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

/** Reads a `.json` events file or a ZIP containing `events.json`. */
export async function readTimelineFile(file: File): Promise<TimelineEventInput[]> {
  const isZip = /\.zip$/i.test(file.name) || file.type === "application/zip";
  let text: string;

  if (isZip) {
    const entries = unzipSync(new Uint8Array(await file.arrayBuffer()));
    const key = Object.keys(entries).find((name) => /(^|\/)events\.json$/i.test(name));
    if (!key) throw new Error("O ZIP não contém um arquivo events.json.");
    text = strFromU8(entries[key]!);
  } else {
    text = await file.text();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Arquivo JSON inválido.");
  }

  const list = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)["events"]
      : null;

  if (!Array.isArray(list) || !list.length) {
    throw new Error("O arquivo precisa conter uma lista `events` com ao menos um evento.");
  }
  if (list.length > 500) throw new Error("Máximo de 500 eventos por importação.");

  return list.map((raw, i) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error(`Evento ${i + 1}: deve ser um objeto.`);
    }
    const row = raw as Record<string, unknown>;
    const name = str(row["name"]);
    if (!name) throw new Error(`Evento ${i + 1}: o campo "name" é obrigatório.`);

    const visibility = str(row["visibility"]).toUpperCase();
    return {
      name,
      year: str(row["year"]),
      month: str(row["month"]),
      day: str(row["day"]),
      hour: str(row["hour"]),
      minute: str(row["minute"]),
      era: str(row["era"]),
      status: str(row["status"]),
      visibility: visibility === "GM_ONLY" ? "GM_ONLY" : visibility === "ALL_PLAYERS" ? "ALL_PLAYERS" : undefined,
      summary: str(row["summary"]),
      what_happened: str(row["what_happened"]),
      consequences: str(row["consequences"]),
      gm_truth: str(row["gm_truth"]),
    } as TimelineEventInput;
  });
}
