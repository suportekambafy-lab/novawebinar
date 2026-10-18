import { describe, expect, it } from "vitest";
import {
  COUNTDOWN_OFF,
  startDelaySeconds,
  activeOffer,
  offerDeadlinePassed,
  isGroupLink,
  roomFormat,
  liveSettings,
  liveVideoPlace,
  purchaseOnScreen,
  followMomentAt,
  profileHandle,
  followWebLink,
  followAppLink,
  suggestFollowMoments,
  parseExtraOffers,
  buildFormatCurve,
  checkoutLink,
  clock,
  curveValueAt,
  discountPercent,
  entryPalette,
  inferAudienceFormat,
  offerColorVars,
  offerCountdownLeft,
  offerTimer,
  roomCountdown,
  lessonTimerAt,
  timerProgress,
} from "@/lib/room-logic";

const ctx = { durationSeconds: 329, pitchSeconds: 311 };

describe("relógio", () => {
  it("minutos e segundos, e horas só a partir de uma hora", () => {
    expect(clock(65)).toBe("01:05");
    expect(clock(3665)).toBe("1:01:05");
    expect(clock(-3)).toBe("00:00");
  });
});

describe("audiência por formato", () => {
  it("toca no mínimo e no máximo escolhidos", () => {
    for (const format of ["dynamic", "cresce", "fala"] as const) {
      const curve = buildFormatCurve(format, 203, 600, ctx);
      expect(Math.min(...curve)).toBe(203);
      expect(Math.max(...curve)).toBe(600);
    }
  });

  it("cresce até à oferta e desce depois", () => {
    const curve = buildFormatCurve("cresce", 100, 500, ctx);
    expect(curveValueAt(curve, 311, 329)).toBeGreaterThan(curveValueAt(curve, 100, 329));
    expect(curveValueAt(curve, 329, 329)).toBeLessThan(curveValueAt(curve, 311, 329));
  });

  it("volta a reconhecer o formato a partir da curva gravada", () => {
    const engagementAt = (t: number) => (t < 120 ? 40 : 75);
    const withSpeech = { ...ctx, engagementAt };
    for (const format of ["dynamic", "cresce", "fala"] as const) {
      const curve = buildFormatCurve(format, 203, 600, withSpeech);
      expect(inferAudienceFormat("simulated", curve, withSpeech)).toBe(format);
    }
    expect(inferAudienceFormat("hybrid", [], ctx)).toBe("mista");
    expect(inferAudienceFormat("real", [], ctx)).toBe("real");
  });

  it("a curva antiga de 28 pontos lê-se como Dinâmica", () => {
    const old = [
      10, 40, 80, 90, 92, 95, 94, 93, 90, 85, 70, 60, 55, 52, 50, 49, 48, 47, 46, 45, 44, 43, 42,
      41, 40, 39, 38, 37,
    ];
    expect(inferAudienceFormat("simulated", old, ctx)).toBe("dynamic");
  });
});

describe("várias ofertas no tempo do vídeo", () => {
  const offer = (id: string, start: number, end: number | null) => ({
    id,
    start,
    end,
    product: id,
    priceFrom: "",
    priceNow: "",
    url: "https://x.pt",
    button: "Comprar",
    countdown: 0,
  });

  it("a especial até ao minuto 10 e depois a geral", () => {
    const offers = [offer("geral", 600, null), offer("especial", 311, 600)];
    expect(activeOffer(offers, 100)).toBeNull();
    expect(activeOffer(offers, 400)?.id).toBe("especial");
    expect(activeOffer(offers, 600)?.id).toBe("geral");
    expect(activeOffer(offers, 2000)?.id).toBe("geral");
  });

  it("uma oferta com fim fecha e, sem outra, não há oferta", () => {
    expect(activeOffer([offer("a", 10, 20)], 25)).toBeNull();
  });

  it("lê as ofertas gravadas e ignora as que não têm minuto", () => {
    const parsed = parseExtraOffers([
      { start: 600, product: "Geral", url: "https://k.ao/x" },
      { product: "sem minuto" },
    ]);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      start: 600,
      end: null,
      product: "Geral",
      button: "Quero entrar",
    });
  });

  it("o prazo fecha no dia seguinte ao escolhido, no fuso do webinar", () => {
    const at = Date.parse("2026-10-12T23:30:00Z"); // 13/10 00:30 em Luanda
    expect(offerDeadlinePassed("2026-10-12", "Africa/Luanda", at)).toBe(true);
    expect(offerDeadlinePassed("2026-10-12", "UTC", at)).toBe(false);
    expect(offerDeadlinePassed(null, "UTC", at)).toBe(false);
  });
});

describe("cores da entrada", () => {
  it("o texto ajusta-se ao fundo e ao botão", () => {
    expect(entryPalette("#FFFFFF", "#FFFFFF")).toMatchObject({
      text: "#171717",
      buttonText: "#171717",
    });
    expect(entryPalette("#141414", "#E8440C")).toMatchObject({
      text: "#FFFFFF",
      buttonText: "#FFFFFF",
    });
  });

  it("um código inválido volta às cores de origem", () => {
    expect(entryPalette("azul", "#12")).toMatchObject({ card: "#141414", button: "#E8440C" });
  });
});

describe("oferta", () => {
  it("desconto só com os dois preços e o segundo menor", () => {
    expect(discountPercent("50 000 Kz", "6 997 Kz")).toBe(86);
    expect(discountPercent("", "6 997 Kz")).toBeNull();
    expect(discountPercent("100", "120")).toBeNull();
  });

  it("o cronómetro começa quando a oferta abre", () => {
    expect(offerCountdownLeft(300, 100, 50)).toBe(300);
    expect(offerCountdownLeft(300, 100, 160)).toBe(240);
    expect(offerCountdownLeft(300, 100, 500)).toBe(0);
    expect(offerCountdownLeft(0, 100, 160)).toBe(0);
  });

  it("no zero: «O botão continua» tira o cronómetro; «O botão fecha» fecha o botão", () => {
    expect(offerTimer(300, 120, false)).toEqual({ left: 120, closed: false });
    expect(offerTimer(300, 0, false)).toEqual({ left: null, closed: false });
    expect(offerTimer(300, 120, true)).toEqual({ left: 120, closed: false });
    expect(offerTimer(300, 0, true)).toEqual({ left: null, closed: true });
    // Sem cronómetro, nada fecha no zero; o último dia fecha sempre.
    expect(offerTimer(0, 0, true)).toEqual({ left: null, closed: false });
    expect(offerTimer(300, 120, false, true)).toEqual({ left: null, closed: true });
  });

  it("o cartão da oferta é quadrado, a não ser que se escolha o compacto", () => {
    expect(liveSettings(null).offerLook).toBe("square");
    expect(liveSettings({ live: { offerLook: "compact" } }).offerLook).toBe("compact");
    expect(liveSettings({ live: { offerLook: "redondo" } }).offerLook).toBe("square");
    expect(liveSettings({ live: { offerLook: "classic" } }).offerLook).toBe("classic");
  });

  it("as cores da oferta ficam vazias por omissão e só aceitam códigos hex", () => {
    expect(liveSettings(null).offerColors).toEqual({});
    expect(liveSettings({ live: {} }).offerColors).toEqual({});
    expect(
      liveSettings({ live: { offerColors: { button: "#16a34a", card: "azul", text: 3 } } })
        .offerColors,
    ).toEqual({ button: "#16A34A" });
    expect(
      liveSettings({ live: { offerColors: { card: "#0F172A", text: "#FACC15" } } }).offerColors,
    ).toEqual({ card: "#0F172A", text: "#FACC15" });
  });

  it("as cores da oferta só mudam o cartão quando escolhidas; o texto ajusta-se ao fundo", () => {
    expect(offerColorVars({})).toBeNull();
    expect(offerColorVars(undefined)).toBeNull();
    const button = offerColorVars({ button: "#FACC15" })!;
    expect(button["--of"]).toBe("#FACC15");
    expect(button["--of-on"]).toBe("#171717");
    expect(button["--room-surface"]).toBeUndefined();
    expect(offerColorVars({ card: "#FFFFFF" })!["--room-ink"]).toBe("#171717");
    expect(offerColorVars({ card: "#0F172A" })!["--room-ink"]).toBe("#FFFFFF");
    expect(offerColorVars({ card: "#0F172A", text: "#FACC15" })!["--room-ink"]).toBe("#FACC15");
  });

  it("o link leva a origem, onde clicou, o minuto e quem é", () => {
    const link = new URL(
      checkoutLink("https://pay.kambafy.com/checkout/abc?x=1", {
        source: "facebook",
        medium: "cpc",
        campaign: "lancamento",
        place: "sala",
        seconds: 311,
        participant: "p1",
      }),
    );
    expect(link.searchParams.get("x")).toBe("1");
    expect(link.searchParams.get("utm_source")).toBe("facebook");
    expect(link.searchParams.get("utm_content")).toBe("sala-05m11s");
    expect(link.searchParams.get("cw")).toBe("p1");
  });

  it("sem anúncio a origem é novawebinar, e não mexe no que o link já traz", () => {
    const link = new URL(
      checkoutLink("https://loja.pt/p?utm_source=newsletter", { place: "chat", seconds: 5 }),
    );
    expect(link.searchParams.get("utm_source")).toBe("newsletter");
    expect(link.searchParams.get("utm_medium")).toBe("webinar");
    expect(checkoutLink("javascript:alert(1)", { place: "sala", seconds: 0 })).toBe(
      "javascript:alert(1)",
    );
  });
});

describe("ofertas por grupo e prazo de cada oferta", () => {
  it("reconhece os links de grupo do WhatsApp e do Telegram", () => {
    expect(isGroupLink("https://chat.whatsapp.com/AbC123")).toBe(true);
    expect(isGroupLink("https://t.me/+grupo")).toBe(true);
    expect(isGroupLink("https://pay.kambafy.com/checkout/x")).toBe(false);
    expect(isGroupLink("")).toBe(false);
  });

  it("guarda o prazo de uma oferta seguinte só com uma data válida", () => {
    const [a, b] = parseExtraOffers([
      { start: 600, url: "https://chat.whatsapp.com/x", deadline: "2026-10-20" },
      { start: 900, url: "https://k.ao/y", deadline: "amanhã" },
    ]);
    expect(a!.deadline).toBe("2026-10-20");
    expect(b!.deadline).toBeNull();
  });
});

describe("formato da sala", () => {
  it("só é Live quando foi escolhido; o resto (e o que já existia) fica Webinar", () => {
    expect(roomFormat({ tone: "natural", room_format: "live" })).toBe("live");
    expect(roomFormat({ room_format: "outra" })).toBe("webinar");
    expect(roomFormat({})).toBe("webinar");
    expect(roomFormat(null)).toBe("webinar");
  });
});

describe("opções da sala", () => {
  it("lê o que foi gravado e completa o resto com o valor por omissão", () => {
    const live = liveSettings({
      room_format: "live",
      live: {
        desk: "vertical",
        entry: "pulse",
        badge: "blue",
        links: { instagram: " https://www.instagram.com/amadorubenn/ ", youtube: "", x: "y" },
        moments: [
          { start: 130, end: 160 },
          { start: 50, end: 40 },
          { start: 10, end: 40 },
        ],
        notify: false,
        hideFollowed: false,
        offerColor: "azul",
      },
    });
    expect(live.desk).toBe("vertical");
    expect(live.entry).toBe("pulse");
    expect(live.links).toEqual({ instagram: "https://www.instagram.com/amadorubenn/" });
    expect(live.moments).toEqual([
      { start: 10, end: 40 },
      { start: 130, end: 160 },
    ]);
    expect(live.notify).toBe(false);
    expect(live.hideFollowed).toBe(false);
    // As cores gravadas por nome passam ao código hex; um código escreve-se em maiúsculas.
    expect(live.offerColor).toBe("#2563EB");
    expect(liveSettings({ live: { entry: "outro" } }).entry).toBe("info");
    expect(liveSettings(null)).toMatchObject({
      desk: "horizontal",
      entry: "info",
      notify: true,
      hideFollowed: true,
      offerColor: "#E8440C",
    });
    expect(liveSettings({ live: { offerColor: "rosa" } }).offerColor).toBe("#E8440C");
    expect(liveSettings({ live: { offerColor: "#ff00aa" } }).offerColor).toBe("#FF00AA");
    expect(liveSettings({ live: { offerColor: "#ff00a" } }).offerColor).toBe("#E8440C");
  });

  it("o título e quem apresenta aparecem por omissão; só desligados à mão saem", () => {
    expect(liveSettings(null).header).toBe(true);
    expect(liveSettings({ live: {} }).header).toBe(true);
    expect(liveSettings({ live: { header: false } }).header).toBe(false);
    expect(liveSettings({ live: { header: "não" } }).header).toBe(true);
  });

  it("o botão de ecrã inteiro aparece por omissão; só desligado à mão sai", () => {
    expect(liveSettings(null).fullscreenButton).toBe(true);
    expect(liveSettings({ live: {} }).fullscreenButton).toBe(true);
    expect(liveSettings({ live: { fullscreenButton: false } }).fullscreenButton).toBe(false);
    expect(liveSettings({ live: { fullscreenButton: "não" } }).fullscreenButton).toBe(true);
  });

  it("a sala de espera: sem vídeo e com a contagem por omissão; um id estragado não passa", () => {
    const id = "6f1c2a7e-1b2c-4d5e-8f90-123456789abc";
    expect(liveSettings(null).waiting).toEqual({ video: null, countdown: true });
    expect(liveSettings({ live: { waiting: { video: id, countdown: false } } }).waiting).toEqual({
      video: id,
      countdown: false,
    });
    expect(
      liveSettings({ live: { waiting: { video: "x'; drop", countdown: "não" } } }).waiting,
    ).toEqual({ video: null, countdown: true });
  });

  it("o lugar do vídeo depende só da forma do ficheiro e do aparelho", () => {
    expect(liveVideoPlace("vertical", "phone")).toBe("fill");
    expect(liveVideoPlace("vertical", "desk")).toBe("column");
    expect(liveVideoPlace("horizontal", "phone")).toBe("top");
    expect(liveVideoPlace("horizontal", "desk")).toBe("wide");
    // Sem a forma (vídeo embebido de outra plataforma), conta como deitado.
    expect(liveVideoPlace(null, "phone")).toBe("top");
  });

  it("o + Seguir só aparece dentro dos momentos", () => {
    const m = [{ start: 120, end: 150 }];
    expect(followMomentAt(m, 119)).toBe(false);
    expect(followMomentAt(m, 120)).toBe(true);
    expect(followMomentAt(m, 150)).toBe(false);
    expect(followMomentAt([], 10)).toBe(false);
  });

  it("tira o @ do link e no YouTube pede para subscrever", () => {
    expect(profileHandle("https://www.instagram.com/amadorubenn/")).toBe("@amadorubenn");
    expect(profileHandle("https://www.tiktok.com/@amadoruben?lang=pt")).toBe("@amadoruben");
    expect(followWebLink("youtube", "https://www.youtube.com/@amadorubenn")).toBe(
      "https://www.youtube.com/@amadorubenn?sub_confirmation=1",
    );
    expect(followWebLink("youtube", "https://www.youtube.com/@x?sub_confirmation=1")).toBe(
      "https://www.youtube.com/@x?sub_confirmation=1",
    );
    expect(followWebLink("instagram", "https://www.instagram.com/x/")).toBe(
      "https://www.instagram.com/x/",
    );
  });

  it("no Android abre a app no perfil, com o site como plano B; no resto fica o link", () => {
    const ig = followAppLink("instagram", "https://www.instagram.com/amadorubenn/", "android");
    expect(ig).toBe(
      "intent://www.instagram.com/_u/amadorubenn/#Intent;scheme=https;package=com.instagram.android;S.browser_fallback_url=https%3A%2F%2Fwww.instagram.com%2Famadorubenn%2F;end",
    );
    expect(followAppLink("tiktok", "https://www.tiktok.com/@x", "android")).toContain(
      "package=com.zhiliaoapp.musically",
    );
    expect(followAppLink("instagram", "https://www.instagram.com/x/", "ios")).toBe(
      "https://www.instagram.com/x/",
    );
    expect(followAppLink("instagram", "não é link", "android")).toBe("não é link");
  });

  it("sugere os minutos em que se pede para seguir e junta os que estão colados", () => {
    const lines = [
      { at: 12, text: "Boa noite a todos" },
      { at: 95, text: "Sigam-me no Instagram para não perderem nada" },
      { at: 110, text: "e inscrevam-se no canal" },
      { at: 400, text: "Me segue lá no TikTok" },
      { at: 500, text: "Vamos continuar a aula" },
    ];
    expect(suggestFollowMoments(lines)).toEqual([
      { start: 95, end: 140 },
      { start: 400, end: 430 },
    ]);
  });
});

describe("contagem antes de começar", () => {
  it("lê a escolha gravada e corrige o que vier estragado", () => {
    expect(liveSettings(null).countdown).toBeNull();
    expect(
      liveSettings({
        live: {
          countdown: { on: true, minutes: 10, style: "dark", color: "#16a34a", sound: false },
        },
      }).countdown,
    ).toEqual({
      on: true,
      minutes: 10,
      style: "dark",
      color: "#16A34A",
      sound: false,
      background: { image: null, video: null },
      afterOn: false,
      after: 5,
    });
    expect(
      liveSettings({ live: { countdown: { on: "sim", minutes: 999, style: "glass", color: "x" } } })
        .countdown,
    ).toEqual({
      on: false,
      minutes: 30,
      style: "minimal",
      color: "#E8440C",
      sound: true,
      background: { image: null, video: null },
      afterOn: false,
      after: 5,
    });
    expect(
      liveSettings({ live: { countdown: { on: false, minutes: 5, afterOn: true, after: 3 } } })
        .countdown,
    ).toMatchObject({ afterOn: true, after: 3 });
    expect(
      liveSettings({ live: { countdown: { on: false, minutes: 5, afterOn: "sim", after: 99 } } })
        .countdown,
    ).toMatchObject({ afterOn: false, after: 30 });
    expect(
      liveSettings({ live: { countdown: { on: false, minutes: 5, after: "x" } } }).countdown?.after,
    ).toBe(5);
    const id = "2f3b8f3e-1c2d-4e5f-8a9b-0c1d2e3f4a5b";
    expect(
      liveSettings({
        live: {
          countdown: {
            on: true,
            minutes: 5,
            background: { image: "https://x.test/a.webp", video: id },
          },
        },
      }).countdown?.background,
    ).toEqual({
      image: "https://x.test/a.webp",
      video: id,
    });
    expect(
      liveSettings({
        live: {
          countdown: {
            on: true,
            minutes: 5,
            background: { image: "javascript:alert(1)", video: "x" },
          },
        },
      }).countdown?.background,
    ).toEqual({
      image: null,
      video: null,
    });
  });

  it("a escolha nova manda; sem ela, valem as colunas antigas", () => {
    const legacy = {
      prelive_enabled: true,
      prelive_seconds: 300,
      prelive_template: "glass",
      prelive_sound: false,
    };
    const none = { image: null, video: null };
    expect(
      roomCountdown(
        {
          on: true,
          minutes: 3,
          style: "urgency",
          color: "#2563EB",
          sound: true,
          background: none,
          afterOn: true,
          after: 2,
        },
        legacy,
      ),
    ).toEqual({
      seconds: 180,
      afterSeconds: 120,
      style: "urgency",
      color: "#2563EB",
      sound: true,
      background: none,
    });
    expect(
      roomCountdown(
        {
          on: false,
          minutes: 3,
          style: "urgency",
          color: "#2563EB",
          sound: true,
          background: none,
          afterOn: true,
          after: 2,
        },
        legacy,
      ).seconds,
    ).toBe(0);
    expect(roomCountdown(null, legacy)).toMatchObject({
      seconds: 300,
      style: "premium",
      sound: false,
    });
    expect(roomCountdown(null, { prelive_enabled: false, prelive_seconds: 300 }).seconds).toBe(0);
  });

  it("um webinar antigo com a contagem ligada abre no editor com ela ligada, igual à sala", () => {
    const legacy = {
      prelive_enabled: true,
      prelive_seconds: 600,
      prelive_template: "glass",
      prelive_sound: false,
    };
    expect(liveSettings(null, legacy).countdown).toEqual({
      on: true,
      minutes: 10,
      style: "premium",
      color: "#E8440C",
      sound: false,
      background: { image: null, video: null },
      afterOn: false,
      after: 5,
    });
    // Sem contagem antes da hora mas com espera depois dela: o relógio só corre depois da hora.
    const late = roomCountdown(
      {
        on: false,
        minutes: 3,
        style: "urgency",
        color: "#2563EB",
        sound: true,
        background: { image: null, video: null },
        afterOn: true,
        after: 2,
      },
      legacy,
    );
    expect(late.seconds).toBe(0);
    expect(late.afterSeconds).toBe(120);
    // Desligada depois da hora: os minutos guardados não contam.
    expect(roomCountdown({ ...COUNTDOWN_OFF, afterOn: false, after: 2 }, legacy).afterSeconds).toBe(
      0,
    );
    expect(liveSettings({ live: { desk: "vertical" } }, legacy).countdown?.on).toBe(true);
    // A escolha nova ganha às colunas antigas; desligada, as antigas não contam.
    expect(
      liveSettings({ live: { countdown: { on: false, minutes: 3 } } }, legacy).countdown?.on,
    ).toBe(false);
    expect(
      liveSettings(null, { prelive_enabled: false, prelive_seconds: 600 }).countdown,
    ).toBeNull();
    expect(liveSettings(null, { prelive_enabled: true, prelive_seconds: 0 }).countdown).toBeNull();
    expect(liveSettings(null).countdown).toBeNull();
    expect(roomCountdown(liveSettings(null, legacy).countdown, legacy).seconds).toBe(
      roomCountdown(null, legacy).seconds,
    );
  });
});

describe("aviso de compra no ecrã", () => {
  const schedule = [
    { purchase: { id: "a" }, from: 10, to: 16 },
    { purchase: { id: "b" }, from: 20, to: 26 },
  ];
  it("fica à vista o tempo todo e não volta depois de sair", () => {
    const shown = new Set<string>();
    let showing: string | null = null;
    const at = (t: number) => {
      const slot = purchaseOnScreen(schedule, t, shown, showing);
      showing = slot?.purchase.id ?? null;
      if (slot) shown.add(slot.purchase.id);
      return showing;
    };
    expect(at(9)).toBeNull();
    expect(at(10)).toBe("a");
    expect(at(13)).toBe("a");
    expect(at(15)).toBe("a");
    expect(at(16)).toBeNull();
    // Recuar no vídeo não repete o aviso.
    expect(at(11)).toBeNull();
    expect(at(21)).toBe("b");
  });
});

describe("temporizador da aula", () => {
  it("a % entre «de» e «a», presa entre 0 e 100", () => {
    expect(timerProgress(30, 60, 160)).toBe(0);
    expect(timerProgress(110, 60, 160)).toBe(50);
    expect(timerProgress(500, 60, 160)).toBe(100);
    expect(timerProgress(110, 160, 60)).toBe(0);
    expect(timerProgress(110, 60, 60)).toBe(0);
  });
  it("só aparece ligado e dentro dos minutos escolhidos", () => {
    const timer = { on: true, start: 60, end: 160, model: "ring" as const, color: null };
    expect(lessonTimerAt(timer, 59)).toBeNull();
    expect(lessonTimerAt(timer, 60)).toBe(0);
    expect(lessonTimerAt(timer, 110)).toBe(50);
    expect(lessonTimerAt(timer, 160)).toBe(100);
    expect(lessonTimerAt(timer, 161)).toBeNull();
    expect(lessonTimerAt({ ...timer, on: false }, 110)).toBeNull();
    expect(lessonTimerAt({ ...timer, end: 60 }, 60)).toBeNull();
    expect(lessonTimerAt(undefined, 110)).toBeNull();
  });
  it("lê a escolha gravada; o que vier estragado desliga", () => {
    expect(liveSettings(null).timer).toEqual({
      on: false,
      start: 0,
      end: 0,
      model: "bar",
      color: null,
    });
    expect(
      liveSettings({
        live: { timer: { on: true, start: 60, end: 600, model: "pill", color: "#16a34a" } },
      }).timer,
    ).toEqual({
      on: true,
      start: 60,
      end: 600,
      model: "pill",
      color: "#16A34A",
    });
    expect(
      liveSettings({
        live: { timer: { on: true, start: 600, end: 60, model: "x", color: "verde" } },
      }).timer,
    ).toEqual({
      on: false,
      start: 0,
      end: 0,
      model: "bar",
      color: null,
    });
    expect(liveSettings({ live: { timer: { on: true, start: "a", end: 60 } } }).timer.on).toBe(
      false,
    );
    expect(liveSettings({ live: { timer: { on: true, start: -5, end: 60 } } }).timer.on).toBe(
      false,
    );
  });
});

describe("startDelaySeconds", () => {
  it("lê a contagem depois de começar das definições da sala", () => {
    expect(startDelaySeconds({ live: { countdown: { on: false, afterOn: true, after: 10 } } })).toBe(600);
    expect(startDelaySeconds({ live: { countdown: { on: true, afterOn: false, after: 10 } } })).toBe(0);
    expect(startDelaySeconds({ live: { countdown: null } })).toBe(0);
    expect(startDelaySeconds({ live: "x" })).toBe(0);
    expect(startDelaySeconds(null)).toBe(0);
  });
});
