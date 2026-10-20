import { describe, expect, it } from "vitest";
import { faststartFile, inspectMp4 } from "./mp4-inspect";

/* Um MP4 de brincar: ftyp, mdat com bytes a sério e um moov com mvhd, stsd (um codec) e stco/co64. */

function atom(type: string, body: Uint8Array, largeSize = false): Uint8Array {
  const header = largeSize ? 16 : 8;
  const out = new Uint8Array(header + body.length);
  const view = new DataView(out.buffer);
  if (largeSize) {
    view.setUint32(0, 1);
    view.setBigUint64(8, BigInt(out.length));
  } else view.setUint32(0, out.length);
  for (let i = 0; i < 4; i += 1) out[4 + i] = type.charCodeAt(i);
  out.set(body, header);
  return out;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

function u32s(...values: number[]): Uint8Array {
  const out = new Uint8Array(values.length * 4);
  const view = new DataView(out.buffer);
  values.forEach((v, i) => view.setUint32(i * 4, v));
  return out;
}

function mvhd(timescale: number, duration: number): Uint8Array {
  const body = new Uint8Array(100);
  const view = new DataView(body.buffer);
  view.setUint32(12, timescale);
  view.setUint32(16, duration);
  return atom("mvhd", body);
}

function stsd(codec: string, width: number, height: number): Uint8Array {
  const entryBody = new Uint8Array(78);
  const view = new DataView(entryBody.buffer);
  view.setUint16(24, width);
  view.setUint16(26, height);
  return atom("stsd", concat(u32s(0, 1), atom(codec, entryBody)));
}

function stco(offsets: number[]): Uint8Array {
  return atom("stco", concat(u32s(0, offsets.length), u32s(...offsets)));
}

function co64(offsets: number[]): Uint8Array {
  const body = new Uint8Array(8 + offsets.length * 8);
  const view = new DataView(body.buffer);
  view.setUint32(4, offsets.length);
  offsets.forEach((o, i) => view.setBigUint64(8 + i * 8, BigInt(o)));
  return atom("co64", body);
}

function moov(codec: string, chunks: Uint8Array, seconds = 10): Uint8Array {
  const stbl = atom("stbl", concat(stsd(codec, 1920, 1080), chunks));
  const trak = atom("trak", atom("mdia", atom("minf", stbl)));
  return atom("moov", concat(mvhd(1000, seconds * 1000), trak));
}

const ftyp = atom("ftyp", new TextEncoder().encode("isommp42"));

function fileOf(bytes: Uint8Array, name = "aula.mp4"): File {
  const copy = new Uint8Array(new ArrayBuffer(bytes.length));
  copy.set(bytes);
  return new File([copy], name, { type: "video/mp4", lastModified: 1_000 });
}

describe("inspectMp4", () => {
  it("lê codec, dimensões, duração, débito e se o índice está no fim", async () => {
    const mdat = atom("mdat", new Uint8Array(1000));
    const bytes = concat(ftyp, mdat, moov("hvc1", stco([ftyp.length + 8]), 2));
    const info = await inspectMp4(fileOf(bytes));
    expect(info.isMp4).toBe(true);
    expect(info.codec).toBe("hevc");
    expect(info.width).toBe(1920);
    expect(info.height).toBe(1080);
    expect(info.durationSeconds).toBe(2);
    expect(info.moovAtEnd).toBe(true);
    expect(info.bitrateMbps).toBeCloseTo((bytes.length * 8) / 2 / 1_000_000, 6);
  });

  it("vê o H.264 com o índice à frente", async () => {
    const bytes = concat(ftyp, moov("avc1", stco([100])), atom("mdat", new Uint8Array(50)));
    const info = await inspectMp4(fileOf(bytes));
    expect(info.codec).toBe("h264");
    expect(info.moovAtEnd).toBe(false);
  });

  it("não é MP4: diz que não é, sem rejeitar", async () => {
    const info = await inspectMp4(fileOf(new TextEncoder().encode("isto não é um vídeo, nem perto")));
    expect(info.isMp4).toBe(false);
    expect(info.codec).toBeNull();
  });
});

describe("faststartFile", () => {
  it("passa o moov para a seguir ao ftyp e avança as posições (stco) o tamanho do moov", async () => {
    const payload = new Uint8Array(1000).map((_, i) => i % 251);
    const mdat = atom("mdat", payload);
    const chunkAt = ftyp.length + 8; // o primeiro byte do payload
    const original = concat(ftyp, mdat, moov("avc1", stco([chunkAt, chunkAt + 500])));
    const file = fileOf(original);

    const fixed = await faststartFile(file);
    expect(fixed).not.toBe(file);
    expect(fixed.size).toBe(file.size);
    expect(fixed.name).toBe(file.name);
    expect(fixed.lastModified).toBe(file.lastModified + 1);

    const out = new Uint8Array(await fixed.arrayBuffer());
    const info = await inspectMp4(fixed);
    expect(info.moovAtEnd).toBe(false);
    expect(info.codec).toBe("h264");
    // Ordem: ftyp, moov, mdat.
    const moovLen = original.length - ftyp.length - mdat.length;
    expect(String.fromCharCode(...out.slice(ftyp.length + 4, ftyp.length + 8))).toBe("moov");
    expect(String.fromCharCode(...out.slice(ftyp.length + moovLen + 4, ftyp.length + moovLen + 8))).toBe("mdat");
    // As posições apontam para os mesmos bytes de antes.
    const view = new DataView(out.buffer);
    const stcoAt = out.findIndex((_, i) => String.fromCharCode(...out.slice(i, i + 4)) === "stco");
    const first = view.getUint32(stcoAt + 4 + 8);
    const second = view.getUint32(stcoAt + 4 + 12);
    expect(first).toBe(chunkAt + moovLen);
    expect(second).toBe(chunkAt + 500 + moovLen);
    expect(out[first]).toBe(payload[0]);
    expect(out[second]).toBe(payload[500]);
  });

  it("faz o mesmo com co64 e com um mdat de tamanho a 64 bits", async () => {
    const payload = new Uint8Array(300).map((_, i) => (i * 7) % 256);
    const mdat = atom("mdat", payload, true);
    const chunkAt = ftyp.length + 16;
    const original = concat(ftyp, mdat, moov("hvc1", co64([chunkAt + 10])));
    const fixed = await faststartFile(fileOf(original));
    const out = new Uint8Array(await fixed.arrayBuffer());
    const moovLen = original.length - ftyp.length - mdat.length;
    const co64At = out.findIndex((_, i) => String.fromCharCode(...out.slice(i, i + 4)) === "co64");
    const moved = Number(new DataView(out.buffer).getBigUint64(co64At + 4 + 8));
    expect(moved).toBe(chunkAt + 10 + moovLen);
    expect(out[moved]).toBe(payload[10]);
    expect((await inspectMp4(fixed)).moovAtEnd).toBe(false);
  });

  it("devolve o próprio ficheiro quando o índice já está à frente ou quando não é MP4", async () => {
    const already = fileOf(concat(ftyp, moov("avc1", stco([100])), atom("mdat", new Uint8Array(50))));
    expect(await faststartFile(already)).toBe(already);
    const other = fileOf(new Uint8Array(40));
    expect(await faststartFile(other)).toBe(other);
  });
});
