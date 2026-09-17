/**
 * Sound FX pack — a ZIP with the format documentation (Markdown), an example
 * `sound-fx.json` manifest and example audio files, plus the reader used by the
 * Sound FX import button.
 *
 * Pure data + fflate; no React.
 */
import { strToU8, zipSync, unzipSync, strFromU8 } from "fflate";
import {
  CAMPAIGN_SOUND_FX_MAX_BYTES,
  soundFxMime,
  validateSoundFxFile,
} from "@/lib/campaign-sound-fx";

export const MAX_SOUND_FX_PER_IMPORT = 40;
const MAX_MB = Math.round(CAMPAIGN_SOUND_FX_MAX_BYTES / (1024 * 1024));

export type SoundFxImportItem = { title: string; file: File };

export const SOUND_FX_EXAMPLE_JSON = JSON.stringify(
  {
    packVersion: 1,
    effects: [
      { title: "Porta batendo", file: "sounds/door-slam.wav" },
      { title: "Trovão distante", file: "sounds/thunder.wav" },
    ],
  },
  null,
  2,
);

export function buildSoundFxReadme(): string {
  return `# Importação de Sound FX

Este pacote contém:

- \`sound-fx.json\` — manifesto de exemplo com dois efeitos.
- \`sounds/\` — os arquivos de áudio de exemplo referenciados no manifesto.
- \`README.md\` — este documento.

Para importar, arraste o ZIP no botão **Importar ZIP** da aba
*Media → Sound FX* da campanha. Só o mestre pode importar.

## Estrutura do ZIP

\`\`\`
meus-efeitos.zip
├── sound-fx.json        (obrigatório, na raiz do ZIP)
└── sounds/
    ├── door-slam.wav
    └── thunder.wav
\`\`\`

## Formato do \`sound-fx.json\`

\`\`\`jsonc
{
  "packVersion": 1,
  "effects": [
    {
      "title": "Porta batendo",        // obrigatório — nome mostrado na lista
      "file": "sounds/door-slam.wav"   // obrigatório — caminho dentro do ZIP
    },
    {
      "title": "Trovão distante",
      "file": "sounds/thunder.wav"
    }
  ]
}
\`\`\`

Também é aceito um arquivo que seja apenas a lista:
\`[ { "title": "…", "file": "…" } ]\`.

## Regras

- \`sound-fx.json\` deve ficar na raiz do ZIP (não dentro de uma pasta).
- Formatos aceitos: MP3, OGG, Opus, M4A, WAV e WebM.
- Cada arquivo pode ter no máximo ${MAX_MB} MB.
- Máximo de ${MAX_SOUND_FX_PER_IMPORT} efeitos por importação.
- Os caminhos em \`file\` são relativos à raiz do ZIP e diferenciam maiúsculas
  de minúsculas em alguns sistemas — use exatamente o nome do arquivo.
- A importação só cria efeitos novos; nada é sobrescrito nem apagado.
- Sound FX tocam uma única vez (*one shot*) para todos que estiverem na
  campanha quando o mestre aperta o play — não têm player visível.
`;
}

/** Tiny mono 8-bit PCM WAV, generated so the template ships real playable audio. */
function exampleWav(seconds: number, shape: (t: number) => number): Uint8Array {
  const rate = 8000;
  const samples = Math.floor(rate * seconds);
  const bytes = new Uint8Array(44 + samples);
  const view = new DataView(bytes.buffer);
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };
  ascii(0, "RIFF");
  view.setUint32(4, 36 + samples, true);
  ascii(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  ascii(36, "data");
  view.setUint32(40, samples, true);
  for (let i = 0; i < samples; i += 1) {
    const t = i / rate;
    const value = Math.max(-1, Math.min(1, shape(t)));
    bytes[44 + i] = Math.round((value + 1) * 127.5);
  }
  return bytes;
}

function doorSlamWav() {
  return exampleWav(0.4, (t) => (Math.random() * 2 - 1) * Math.exp(-14 * t));
}

function thunderWav() {
  return exampleWav(1.2, (t) => {
    const rumble = Math.sin(2 * Math.PI * 48 * t) * 0.6 + (Math.random() * 2 - 1) * 0.4;
    return rumble * Math.exp(-2.2 * t);
  });
}

export function buildSoundFxPackZip(): Blob {
  const files = zipSync({
    "README.md": strToU8(buildSoundFxReadme()),
    "sound-fx.json": strToU8(SOUND_FX_EXAMPLE_JSON),
    "sounds/door-slam.wav": doorSlamWav(),
    "sounds/thunder.wav": thunderWav(),
  });
  return new Blob([files as unknown as BlobPart], { type: "application/zip" });
}

function str(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

/** Reads a Sound FX ZIP and returns the effects ready to upload. */
export async function readSoundFxPack(file: File): Promise<SoundFxImportItem[]> {
  if (!/\.zip$/i.test(file.name) && file.type !== "application/zip") {
    throw new Error("Envie o pacote de Sound FX em formato ZIP.");
  }
  const entries = unzipSync(new Uint8Array(await file.arrayBuffer()));
  const manifestKey = Object.keys(entries).find((name) => /(^|\/)sound-fx\.json$/i.test(name));
  if (!manifestKey) throw new Error("O ZIP não contém um arquivo sound-fx.json.");

  let parsed: unknown;
  try {
    parsed = JSON.parse(strFromU8(entries[manifestKey]!));
  } catch {
    throw new Error("O arquivo sound-fx.json não é um JSON válido.");
  }

  const list = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)["effects"]
      : null;

  if (!Array.isArray(list) || !list.length) {
    throw new Error("O manifesto precisa conter uma lista `effects` com ao menos um efeito.");
  }
  if (list.length > MAX_SOUND_FX_PER_IMPORT) {
    throw new Error(`Máximo de ${MAX_SOUND_FX_PER_IMPORT} efeitos por importação.`);
  }

  const prefix = manifestKey.includes("/")
    ? manifestKey.slice(0, manifestKey.lastIndexOf("/") + 1)
    : "";

  return list.map((raw, index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error(`Efeito ${index + 1}: deve ser um objeto.`);
    }
    const row = raw as Record<string, unknown>;
    const title = str(row["title"]);
    const path = str(row["file"]);
    if (!title) throw new Error(`Efeito ${index + 1}: o campo "title" é obrigatório.`);
    if (!path) throw new Error(`Efeito ${index + 1}: o campo "file" é obrigatório.`);

    const wanted = `${prefix}${path}`.replace(/^\.\//, "").toLowerCase();
    const key = Object.keys(entries).find(
      (name) =>
        name.toLowerCase() === wanted || name.toLowerCase().endsWith(`/${path.toLowerCase()}`),
    );
    if (!key) throw new Error(`Efeito ${index + 1}: o arquivo "${path}" não está no ZIP.`);

    const bytes = entries[key]!;
    const name = path.split("/").pop() ?? path;
    const mime = soundFxMime(name) ?? "application/octet-stream";
    const audio = new File([bytes as unknown as BlobPart], name, { type: mime });
    const invalid = validateSoundFxFile(audio);
    if (invalid) throw new Error(`Efeito ${index + 1} ("${title}"): ${invalid}`);

    return { title, file: audio };
  });
}
