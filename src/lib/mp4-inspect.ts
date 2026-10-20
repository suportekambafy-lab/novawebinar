/**
 * Leitura de um MP4/MOV no navegador, antes do envio, sem o carregar para memória: lê só os átomos de
 * topo e o `moov` (o índice do vídeo, uns MB).
 *
 * Serve para três coisas, todas a pensar em quem vê a aula:
 * - o codec: um vídeo em HEVC (H.265) não toca em muitos navegadores (Chrome sem descodificador por
 *   hardware, Firefox, Android antigos) e a sala fica sem imagem; só H.264 toca em todo o lado;
 * - o débito (Mbit/s): a sala serve o ficheiro tal como está, por isso um vídeo a 20 Mbit/s trava em
 *   qualquer rede abaixo disso. Acima de 8 Mbit/s avisa-se;
 * - o índice no fim («sem faststart», o normal em exportações do iPhone, OBS e vários editores): o
 *   leitor tem de ir buscar o fim do ficheiro antes de mostrar o primeiro fotograma. `faststartFile`
 *   passa o `moov` para a frente sem recodificar e sem copiar o vídeo para memória: o ficheiro novo é
 *   feito de fatias (`Blob.slice`) do original, que o envio lê do disco à medida.
 */

export type Mp4Codec = "h264" | "hevc" | "av1" | "vp9" | "mpeg4" | "other";

export type Mp4Info = {
  /** Falso quando não é um MP4/MOV (ou não se leu): nada a dizer sobre o ficheiro. */
  isMp4: boolean;
  codec: Mp4Codec | null;
  /** Verdadeiro quando o `moov` está depois do `mdat` (o leitor precisa do fim do ficheiro para arrancar). */
  moovAtEnd: boolean;
  durationSeconds: number | null;
  /** Débito médio do ficheiro inteiro, em Mbit/s. */
  bitrateMbps: number | null;
  width: number | null;
  height: number | null;
};

/** Débito a partir do qual se avisa que o vídeo pode travar em dados móveis. */
export const HEAVY_BITRATE_MBPS = 8;

const CONTAINERS = new Set(["moov", "trak", "mdia", "minf", "stbl"]);
const VIDEO_CODECS: Record<string, Mp4Codec> = {
  avc1: "h264",
  avc3: "h264",
  hvc1: "hevc",
  hev1: "hevc",
  dvh1: "hevc",
  dvhe: "hevc",
  av01: "av1",
  vp09: "vp9",
  mp4v: "mpeg4",
};
/** O `moov` nunca passa disto numa aula: acima, não se mexe no ficheiro. */
const MAX_MOOV_BYTES = 256 * 1024 * 1024;

type Atom = { type: string; start: number; size: number; headerSize: number };

function fourcc(view: DataView, at: number): string {
  return String.fromCharCode(view.getUint8(at), view.getUint8(at + 1), view.getUint8(at + 2), view.getUint8(at + 3));
}

/** O átomo que começa em `start` dentro de `buffer` (visto como o troço do ficheiro a partir de `base`). */
function atomAt(view: DataView, start: number, end: number, base: number): Atom | null {
  if (start + 8 > end) return null;
  let size = view.getUint32(start);
  const type = fourcc(view, start + 4);
  let headerSize = 8;
  if (size === 1) {
    if (start + 16 > end) return null;
    size = Number(view.getBigUint64(start + 8));
    headerSize = 16;
  } else if (size === 0) {
    size = end - start;
  }
  if (size < headerSize) return null;
  return { type, start: base + start, size, headerSize };
}

async function readRange(file: Blob, start: number, length: number): Promise<DataView> {
  const buffer = await file.slice(start, Math.min(file.size, start + length)).arrayBuffer();
  return new DataView(buffer);
}

/** Os átomos de topo do ficheiro (ftyp, free, mdat, moov…), lidos cabeçalho a cabeçalho. */
async function topLevelAtoms(file: Blob): Promise<Atom[]> {
  const atoms: Atom[] = [];
  let offset = 0;
  while (offset + 8 <= file.size && atoms.length < 64) {
    const view = await readRange(file, offset, 16);
    const atom = atomAt(view, 0, view.byteLength, offset);
    if (!atom) break;
    // Um tamanho impossível: não é um MP4 são.
    if (atom.start + atom.size > file.size) break;
    atoms.push(atom);
    offset = atom.start + atom.size;
  }
  return atoms;
}

/** Percorre os átomos dentro de um contentor, chamando `visit` por cada um (recursivo nos contentores). */
function walk(view: DataView, start: number, end: number, visit: (atom: Atom, view: DataView) => void) {
  let offset = start;
  while (offset + 8 <= end) {
    const atom = atomAt(view, offset, end, 0);
    if (!atom || atom.size === 0) break;
    visit(atom, view);
    if (CONTAINERS.has(atom.type) && atom.type !== "moov") {
      walk(view, atom.start + atom.headerSize, Math.min(end, atom.start + atom.size), visit);
    }
    offset = atom.start + atom.size;
  }
}

type MoovFacts = {
  codec: Mp4Codec | null;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  /** Posição (dentro do `moov`) das tabelas de posições dos blocos, para o faststart. */
  chunkTables: { type: "stco" | "co64"; at: number; count: number }[];
};

function readMoov(view: DataView): MoovFacts {
  const facts: MoovFacts = { codec: null, durationSeconds: null, width: null, height: null, chunkTables: [] };
  const root = atomAt(view, 0, view.byteLength, 0);
  if (!root || root.type !== "moov") return facts;
  walk(view, root.headerSize, root.size, (atom) => {
    const body = atom.start + atom.headerSize;
    if (atom.type === "mvhd" && body + 20 <= view.byteLength) {
      const version = view.getUint8(body);
      const timescale = version === 1 ? view.getUint32(body + 20) : view.getUint32(body + 12);
      const duration = version === 1 ? Number(view.getBigUint64(body + 24)) : view.getUint32(body + 16);
      if (timescale > 0 && duration > 0) facts.durationSeconds = duration / timescale;
    }
    if (atom.type === "stsd" && body + 8 <= view.byteLength) {
      // Cabeçalho completo (versão + flags + contagem) e depois as entradas, cada uma com o seu fourcc.
      const count = view.getUint32(body + 4);
      let at = body + 8;
      for (let i = 0; i < count && at + 8 <= atom.start + atom.size; i += 1) {
        const entry = atomAt(view, at, atom.start + atom.size, 0);
        if (!entry) break;
        const known = VIDEO_CODECS[entry.type];
        if (known && !facts.codec) {
          facts.codec = known;
          // VisualSampleEntry: 6 reservados + 2 índice + 16 pré-definidos + largura + altura (16 bits).
          const dims = entry.start + entry.headerSize + 24;
          if (dims + 4 <= view.byteLength) {
            facts.width = view.getUint16(dims);
            facts.height = view.getUint16(dims + 2);
          }
        }
        at = entry.start + entry.size;
      }
    }
    if ((atom.type === "stco" || atom.type === "co64") && body + 8 <= view.byteLength) {
      facts.chunkTables.push({ type: atom.type, at: body + 8, count: view.getUint32(body + 4) });
    }
  });
  if (!facts.codec) {
    // Há vídeo mas com um codec que não conhecemos (ou só áudio): fica «other» quando houver alguma entrada visual.
    facts.codec = null;
  }
  return facts;
}

/** Lê o essencial do ficheiro. Nunca rejeita: o que não se conseguir ler fica a null. */
export async function inspectMp4(file: Blob): Promise<Mp4Info> {
  const none: Mp4Info = {
    isMp4: false,
    codec: null,
    moovAtEnd: false,
    durationSeconds: null,
    bitrateMbps: null,
    width: null,
    height: null,
  };
  try {
    const atoms = await topLevelAtoms(file);
    const ftyp = atoms.find((a) => a.type === "ftyp");
    const moov = atoms.find((a) => a.type === "moov");
    const mdat = atoms.find((a) => a.type === "mdat");
    if (!ftyp || !moov) return none;
    if (moov.size > MAX_MOOV_BYTES) return { ...none, isMp4: true, moovAtEnd: !!mdat && moov.start > mdat.start };
    const facts = readMoov(await readRange(file, moov.start, moov.size));
    const duration = facts.durationSeconds;
    return {
      isMp4: true,
      codec: facts.codec,
      moovAtEnd: !!mdat && moov.start > mdat.start,
      durationSeconds: duration,
      bitrateMbps: duration && duration > 0 ? (file.size * 8) / duration / 1_000_000 : null,
      width: facts.width,
      height: facts.height,
    };
  } catch {
    return none;
  }
}

/**
 * O mesmo vídeo com o `moov` logo a seguir ao `ftyp`, para o leitor arrancar sem ir ao fim do ficheiro.
 * Devolve o próprio ficheiro quando já está assim, quando não é um MP4, ou quando não dá para mexer
 * (índice gigante, posições a 32 bits que transbordariam). Não recodifica: os bytes do vídeo são os mesmos,
 * só as posições dos blocos (stco/co64) avançam o tamanho do `moov` que passou para a frente.
 */
export async function faststartFile(file: File): Promise<File> {
  try {
    const atoms = await topLevelAtoms(file);
    const ftyp = atoms.find((a) => a.type === "ftyp");
    const moov = atoms.find((a) => a.type === "moov");
    const mdat = atoms.find((a) => a.type === "mdat");
    if (!ftyp || !moov || !mdat || moov.start < mdat.start || moov.size > MAX_MOOV_BYTES) return file;
    // Só se o ficheiro for exactamente a sequência de átomos lida (sem lixo no fim).
    const last = atoms[atoms.length - 1]!;
    if (last.start + last.size !== file.size) return file;

    const moovBytes = new Uint8Array(await file.slice(moov.start, moov.start + moov.size).arrayBuffer());
    const view = new DataView(moovBytes.buffer);
    const facts = readMoov(view);
    if (facts.chunkTables.length === 0) return file;

    // O `moov` entra a seguir ao `ftyp`: tudo o que estava entre o `ftyp` e o `moov` avança `moov.size`.
    const shift = moov.size;
    for (const table of facts.chunkTables) {
      const width = table.type === "stco" ? 4 : 8;
      if (table.at + table.count * width > moovBytes.byteLength) return file;
      for (let i = 0; i < table.count; i += 1) {
        const at = table.at + i * width;
        if (table.type === "stco") {
          const moved = view.getUint32(at) + shift;
          if (moved > 0xffffffff) return file;
          view.setUint32(at, moved);
        } else {
          view.setBigUint64(at, view.getBigUint64(at) + BigInt(shift));
        }
      }
    }

    const middleStart = ftyp.start + ftyp.size;
    const parts: BlobPart[] = [file.slice(0, middleStart), moovBytes, file.slice(middleStart, moov.start)];
    const tailStart = moov.start + moov.size;
    if (tailStart < file.size) parts.push(file.slice(tailStart));
    // `lastModified` diferente de propósito: o envio retomável identifica o ficheiro por nome, tamanho e
    // data, e um envio a meio do original (bytes noutra ordem) não pode continuar com este.
    return new File(parts, file.name, { type: file.type, lastModified: file.lastModified + 1 });
  } catch {
    return file;
  }
}

/** Nome do codec para mostrar à pessoa. */
export function codecLabel(codec: Mp4Codec | null): string {
  switch (codec) {
    case "h264":
      return "H.264";
    case "hevc":
      return "HEVC (H.265)";
    case "av1":
      return "AV1";
    case "vp9":
      return "VP9";
    case "mpeg4":
      return "MPEG-4 Part 2";
    default:
      return "desconhecido";
  }
}
