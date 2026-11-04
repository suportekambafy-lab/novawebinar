import { afterEach, describe, expect, it, vi } from "vitest";
import { audioUrlFor } from "./assemblyai.server";

const MP4 = "https://vz-x.b-cdn.net/abc/play_720p.mp4";

afterEach(() => vi.unstubAllGlobals());

describe("audioUrlFor", () => {
  it("ficheiro aberto: a AssemblyAI vai buscá-lo directamente", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("x", { status: 206 })));
    const upload = vi.fn();
    expect(await audioUrlFor(MP4, "https://site.test", upload)).toBe(MP4);
    expect(upload).not.toHaveBeenCalled();
  });

  it("Bunny com referrers (403 sem Referer): descarrega o 240p com o endereço do site e envia-o", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const referer = (init?.headers as Record<string, string> | undefined)?.["Referer"];
      return new Response("video", { status: referer ? 200 : 403 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const upload = vi.fn(async () => "https://cdn.assemblyai.test/upload/1");
    expect(await audioUrlFor(MP4, "https://site.test", upload)).toBe("https://cdn.assemblyai.test/upload/1");
    expect(fetchMock.mock.calls[1]![0]).toBe("https://vz-x.b-cdn.net/abc/play_240p.mp4");
    expect((fetchMock.mock.calls[1]![1]!.headers as Record<string, string>)["Referer"]).toBe("https://site.test/");
  });

  it("recusado mesmo com Referer: explica o que confirmar no Bunny", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 403 })));
    await expect(audioUrlFor(MP4, "https://site.test", vi.fn())).rejects.toThrow(/referrers permitidos/);
  });
});
