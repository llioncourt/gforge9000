/**
 * Calendar pack — a small ZIP with the format documentation (Markdown) and an
 * example calendar.json, plus the reader used by the import button.
 *
 * Pure data + fflate; no React.
 */
import { strToU8, zipSync, unzipSync, strFromU8 } from "fflate";
import { calendarOf, NADREL_PRESET, type WorldCalendar } from "@/lib/world-calendar";

export const CALENDAR_EXAMPLE_JSON = JSON.stringify(NADREL_PRESET, null, 2);

export function buildCalendarReadme(): string {
  return `# Estrutura do calendário do mundo

Este pacote contém:

- \`calendar.json\` — exemplo completo (Calendário de Nadrel).
- \`README.md\` — este documento.

Importe o \`calendar.json\` (ou o próprio ZIP) pelo botão **Importar calendário**
na aba Timeline da campanha.

## Formato

\`\`\`jsonc
{
  "era": "Terceira Era",            // nome livre da era (pode ser "")

  "units": {                         // nomes canônicos de cada contagem de tempo
    "era":    { "singular": "Era",    "plural": "Eras" },
    "year":   { "singular": "Ciclo",  "plural": "Ciclos" },
    "season": { "singular": "Quarto", "plural": "Quartos" },
    "month":  { "singular": "Mês",    "plural": "Meses" },
    "week":   { "singular": "Semana", "plural": "Semanas" },
    "day":    { "singular": "Rota",   "plural": "Rotas" },
    "hour":   { "singular": "Quarto", "plural": "Quartos" },
    "minute": { "singular": "Parte",  "plural": "Partes" }
  },

  "months": [                        // ordem = ordem do ano; duração individual
    { "name": "Mês da Geada", "days": 44 }
  ],

  "seasons": [                       // agrupam meses por índice 0-based
    { "name": "Quarto da Geada", "subtitle": "Frio que preserva", "months": [0, 1] }
  ],

  "week": {                          // daysPerWeek: 0 = mundo sem semanas
    "daysPerWeek": 7,
    "dayNames": ["Domingo", "Segunda"]
  },

  "daySubdivision": {                // como o dia se divide
    "hoursPerDay": 24,
    "minutesPerHour": 60
  },

  "leapRule": { "kind": "none" },    // ver abaixo

  "today": {                         // data atual (ou null)
    "year": 1042, "month": 1, "day": 1, "hour": 0, "minute": 0
  }
}
\`\`\`

### Regra de ano bissexto (\`leapRule\`)

| kind | significado |
| --- | --- |
| \`{"kind":"none"}\` | sem anos bissextos |
| \`{"kind":"gregorian"}\` | regra terráquea (divisível por 4, exceto 100, salvo 400); dia extra em fevereiro |
| \`{"kind":"block","block":10,"years":[4,7,10],"month":5,"extraDays":1}\` | a cada bloco de \`block\` anos, os anos nas posições \`years\` (1-based dentro do bloco) recebem \`extraDays\` dia(s) extra(s) no mês de índice \`month\` (0-based) |

### Observações

- \`month\` em \`today\` é **1-based**; \`months\` em \`seasons\` e em \`leapRule\` é **0-based**.
- Campos ausentes assumem o padrão terráqueo (ano/mês/dia, semana de 7 dias, 24h × 60min).
- Nada aqui afeta outras partes da campanha: o calendário só ordena e formata datas de eventos.
`;
}

export function buildCalendarPackZip(): Blob {
  const files = zipSync({
    "README.md": strToU8(buildCalendarReadme()),
    "calendar.json": strToU8(CALENDAR_EXAMPLE_JSON),
  });
  return new Blob([files as unknown as BlobPart], { type: "application/zip" });
}

/** Reads a `.json` calendar file or a ZIP containing `calendar.json`. */
export async function readCalendarFile(file: File): Promise<WorldCalendar> {
  const isZip = /\.zip$/i.test(file.name) || file.type === "application/zip";
  let text: string;

  if (isZip) {
    const entries = unzipSync(new Uint8Array(await file.arrayBuffer()));
    const key = Object.keys(entries).find((name) => /(^|\/)calendar\.json$/i.test(name));
    if (!key) throw new Error("O ZIP não contém um arquivo calendar.json.");
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
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("O calendário deve ser um objeto JSON.");
  }

  const record = parsed as Record<string, unknown>;
  // Accept both a bare calendar and a `{ "calendar": { … } }` wrapper.
  const calendar = calendarOf(record["calendar"] ? record : { calendar: record });
  if (!calendar.months.length) throw new Error("O calendário precisa de ao menos um mês.");
  return calendar;
}
