import { describe, expect, it } from "vitest";
import { decideWebinar, smartLinkInput } from "./model";

const link = { primary_webinar_id: "fav", secondary_webinar_id: "sec", status: "active" };

describe("Webinar Intelligence: a decisão do webinar", () => {
  it("quem chega de novo vai para o favorito; quem já viu vai para o secundário", () => {
    expect(decideWebinar(link, false)).toBe("fav");
    expect(decideWebinar(link, true)).toBe("sec");
  });

  it("sem secundário, ou em pausa, vai todo para o favorito", () => {
    expect(decideWebinar({ ...link, secondary_webinar_id: null }, true)).toBe("fav");
    expect(decideWebinar({ ...link, status: "paused" }, true)).toBe("fav");
  });

  it("o endereço só aceita letras minúsculas, números e hífens", () => {
    expect(smartLinkInput.safeParse({ name: "Link principal", slug: "aula-gratis", primaryWebinarId: "9e0b8c2e-5c3a-4b1e-9e7a-1c2d3e4f5a6b" }).success).toBe(true);
    expect(smartLinkInput.safeParse({ name: "Link", slug: "Aula Grátis", primaryWebinarId: "9e0b8c2e-5c3a-4b1e-9e7a-1c2d3e4f5a6b" }).success).toBe(false);
    expect(smartLinkInput.safeParse({ name: "Link", slug: "ok", primaryWebinarId: "9e0b8c2e-5c3a-4b1e-9e7a-1c2d3e4f5a6b" }).success).toBe(false);
  });
});
