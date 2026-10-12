import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A sala aberta só se mantém se uma leitura falhada chegar ao browser como
 * erro. Se chegasse como "sessão não existe", a sala era substituída.
 */
type Result = { data: unknown; error: { message: string } | null; count?: number | null };
let answers: Record<string, Result>;
let inserts: string[];
let signings = 0;

vi.mock("@/integrations/supabase/client.server", () => {
  const query = (table: string) => {
    let op = "select";
    const chain: Record<string, unknown> = new Proxy(
      {},
      {
        get(_, name: string) {
          if (name === "then") {
            const result = answers[`${table}.${op}`] ?? { data: null, error: null };
            return (ok: (value: Result) => unknown) => Promise.resolve(result).then(ok);
          }
          return () => {
            if (name === "insert" || name === "update") {
              op = name;
              inserts.push(`${table}.${name}`);
            }
            return chain;
          };
        },
      },
    );
    return chain;
  };
  return {
    supabaseAdmin: {
      from: (table: string) => query(table),
      rpc: async () => ({ data: null, error: null }),
      storage: {
        from: () => ({
          createSignedUrl: async (path: string) => ({ data: { signedUrl: `https://cdn/${path}?token=${++signings}` } }),
        }),
      },
    },
  };
});

const { clearPublicRoomCache, loadPublicRoom, loadRoomMessages, participantFromToken, recordCta, roomToken } = await import("./public-room.server");

const down: Result = { data: null, error: { message: "fetch failed" } };
const WEBINAR = {
  id: "w-1",
  organization_id: "org-1",
  public_title: "Sessão",
  status: "scheduled",
};
const PARTICIPANT = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  clearPublicRoomCache();
  answers = { "webinars.select": { data: WEBINAR, error: null } };
  inserts = [];
});

describe("sala pública com a base de dados em baixo", () => {
  it("webinar que não existe devolve null", async () => {
    answers["webinars.select"] = { data: null, error: null };
    expect(await loadPublicRoom("nao-existe")).toBeNull();
  });

  it("falha a ler o webinar é erro, não 'sessão não encontrada'", async () => {
    answers["webinars.select"] = down;
    await expect(loadPublicRoom("sessao")).rejects.toThrow("indisponível");
  });

  it("falha a ler os comentários é erro, não uma sala sem chat", async () => {
    answers["scheduled_comments.select"] = down;
    await expect(loadPublicRoom("sessao")).rejects.toThrow("indisponível");
  });

  it("com tudo lido, a sala abre", async () => {
    answers["scheduled_comments.select"] = { data: [{ id: "c-1" }], error: null, count: 1 };
    const loaded = await loadPublicRoom("sessao");
    expect(loaded?.webinar.id).toBe("w-1");
    expect(loaded?.comments).toHaveLength(1);
  });

  it("o vídeo do Storage sai com o mesmo URL assinado para todos, para o CDN o servir da cache", async () => {
    answers["webinars.select"] = {
      data: { ...WEBINAR, video_sources: { storage_path: "org/aula.mp4", source_url: null } },
      error: null,
    };
    const first = await loadPublicRoom("sessao");
    clearPublicRoomCache();
    const second = await loadPublicRoom("sessao");
    expect(first?.webinar.video_url).toMatch(/^https:\/\/cdn\/org\/aula\.mp4\?token=/);
    expect(second?.webinar.video_url).toBe(first?.webinar.video_url);
  });

  it("o vídeo de fundo da espera vem assinado; sem sala de espera ou sem vídeo na Biblioteca, null", async () => {
    const live = { live: { waiting: { video: "6f1c2a7e-1b2c-4d5e-8f90-123456789abc" } } };
    answers["webinars.select"] = { data: { ...WEBINAR, waiting_room_enabled: true, chat_settings: live }, error: null };
    expect((await loadPublicRoom("sessao"))?.webinar.waiting_video).toBeNull();
    answers["video_sources.select"] = { data: { storage_path: "org/fundo.mp4", source_url: null, provider: "upload" }, error: null };
    clearPublicRoomCache();
    expect((await loadPublicRoom("sessao"))?.webinar.waiting_video).toEqual({ url: expect.stringMatching(/^https:\/\/cdn\/org\/fundo\.mp4/), provider: "upload" });
    answers["webinars.select"] = { data: { ...WEBINAR, waiting_room_enabled: false, chat_settings: live }, error: null };
    clearPublicRoomCache();
    expect((await loadPublicRoom("sessao"))?.webinar.waiting_video).toBeNull();
  });

  it("o convite do grupo do fluxo vem com a sala; sem grupo, null", async () => {
    expect((await loadPublicRoom("sessao"))?.webinar.group_url).toBeNull();
    clearPublicRoomCache();
    answers["automation_workflows.select"] = {
      data: [{ canvas: { nodes: [{ kind: "group", url: "chat.whatsapp.com/abc" }] } }],
      error: null,
    };
    expect((await loadPublicRoom("sessao"))?.webinar.group_url).toBe("https://chat.whatsapp.com/abc");
  });

  it("falha a ler as mensagens é erro, não uma conversa vazia", async () => {
    answers["private_messages.select"] = down;
    await expect(loadRoomMessages(PARTICIPANT)).rejects.toThrow();
  });
});

describe("clique na oferta", () => {
  const click = () =>
    recordCta({ participantId: PARTICIPANT, eventType: "click", videoSecond: 10 });

  beforeEach(() => {
    answers["participants.select"] = {
      data: {
        id: PARTICIPANT,
        name: "João",
        email: "convidado@sala.local",
        webinar_id: "w-1",
        organization_id: "org-1",
      },
      error: null,
    };
  });

  it("clique guardado responde ok", async () => {
    expect(await click()).toEqual({ ok: true });
    expect(inserts).toContain("cta_events.insert");
  });

  it("clique que não ficou guardado é erro, para a sala repetir o envio", async () => {
    answers["cta_events.insert"] = down;
    await expect(click()).rejects.toThrow("indisponível");
  });

  it("falha a ler o participante é erro, não um clique ignorado", async () => {
    answers["participants.select"] = down;
    await expect(click()).rejects.toThrow("indisponível");
  });
});

/* ---------- Cenário do /code-review (2026-10-01): acesso ao chat de outra pessoa ---------- */

describe("credencial da sala", () => {
  beforeEach(() => vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "chave-de-teste"));

  it("só a credencial emitida ao entrar diz quem é o participante", () => {
    const token = roomToken(PARTICIPANT);
    expect(participantFromToken(token)).toBe(PARTICIPANT);
  });

  it("o id de outra pessoa (vindo de um webhook ou da API) não chega para ler ou escrever no chat dela", () => {
    const outra = "22222222-2222-4222-8222-222222222222";
    expect(participantFromToken(outra)).toBeNull();
    // Trocar o id numa credencial válida também não serve: a assinatura é do id original.
    const [, signature] = roomToken(PARTICIPANT).split(".");
    expect(participantFromToken(`${outra}.${signature}`)).toBeNull();
    expect(participantFromToken(`${outra}.`)).toBeNull();
    expect(participantFromToken(`${roomToken(PARTICIPANT)}.extra`)).toBeNull();
  });

  it("com outra chave de servidor, as credenciais antigas deixam de valer", () => {
    const token = roomToken(PARTICIPANT);
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "chave-nova");
    expect(participantFromToken(token)).toBeNull();
  });
});
