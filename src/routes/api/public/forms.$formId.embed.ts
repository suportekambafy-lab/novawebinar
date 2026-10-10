import { createFileRoute } from "@tanstack/react-router";

/**
 * Formulário embed: um <script> que se coloca na página externa (WordPress, Elementor,
 * Framer, Webflow, HTML). Desenha o formulário num shadow DOM (o CSS da página não o
 * estraga), lê as UTM e o referrer da página onde está, e envia para /api/public/register.
 * Os campos, o texto e a cor do botão vêm da etapa Página do editor: uma só fonte com a sala.
 *
 *   <script src="https://<app>/api/public/forms/<id>/embed" async></script>
 *
 * Para o colocar num sítio certo: <div data-novawebinar-form="<id>"></div> antes do script.
 */
const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const js = (body: string, status = 200) =>
  new Response(body, {
    status,
    headers: {
      "content-type": "text/javascript; charset=utf-8",
      "cache-control": "public, max-age=60",
      "access-control-allow-origin": "*",
    },
  });

export const Route = createFileRoute("/api/public/forms/$formId/embed")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        if (!/^[0-9a-f-]{36}$/i.test(params.formId)) return js("console.warn('Novawebinar: formulário inválido');", 404);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: form } = await supabaseAdmin
          .from("registration_forms")
          .select(
            "id, active, consent_text, webinars(status, entry_fields, registration_collect_phone, registration_require_phone, registration_button_text, entry_button_color)",
          )
          .eq("id", params.formId)
          .maybeSingle();
        const webinar = form?.webinars;
        if (!form || !form.active || !webinar || webinar.status === "draft")
          return js("console.warn('Novawebinar: formulário indisponível');", 404);

        const { embedFields, parseEntryFields } = await import("@/lib/entry-fields");
        const { entryPalette } = await import("@/lib/room-logic");
        const { DEFAULT_PHONE_COUNTRY, PHONE_COUNTRIES } = await import("@/lib/phone-countries");
        const fields = embedFields(
          parseEntryFields(webinar.entry_fields, {
            collectPhone: webinar.registration_collect_phone,
            requirePhone: webinar.registration_require_phone,
          }),
        );
        const palette = entryPalette(null, webinar.entry_button_color);
        const config = {
          formId: form.id,
          endpoint: `${new URL(request.url).origin}/api/public/register`,
          // O texto vai para innerHTML: escapado aqui; a chave vai só para o JSON do pedido.
          fields: fields.map((f) => ({ ...f, label: escapeHtml(f.label), placeholder: escapeHtml(f.placeholder) })),
          countries: fields.some((f) => f.phone)
            ? PHONE_COUNTRIES.map((c) => ({ code: c.code, dial: c.dial, label: `${c.flag} ${c.dial}`, on: c === DEFAULT_PHONE_COUNTRY }))
            : [],
          button: escapeHtml(webinar.registration_button_text || "Entrar na sala"),
          color: palette.button,
          colorText: palette.buttonText,
          consent: form.consent_text ? escapeHtml(form.consent_text) : null,
        };
        // O JSON vai dentro de um script: "</" nunca pode fechar a tag.
        const cfg = JSON.stringify(config).replace(/</g, "\\u003c");
        return js(`(function () {
  var cfg = ${cfg};
  var script = document.currentScript;
  var host = document.querySelector('[data-novawebinar-form="' + cfg.formId + '"]');
  if (!host) { host = document.createElement("div"); if (script && script.parentNode) script.parentNode.insertBefore(host, script); else document.body.appendChild(host); }
  if (host.getAttribute("data-cw-ready")) return;
  host.setAttribute("data-cw-ready", "1");
  var root = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;
  var sid = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2);
  // O indicativo pelo fuso horário do aparelho (sem pedir nada à pessoa); senão, o de sempre.
  var here = "";
  try {
    var tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    here = ({ "Africa/Luanda": "AO", "Europe/Lisbon": "PT", "Atlantic/Madeira": "PT", "Atlantic/Azores": "PT", "Africa/Maputo": "MZ", "Atlantic/Cape_Verde": "CV", "Africa/Bissau": "GW", "Africa/Sao_Tome": "ST", "Asia/Dili": "TL" })[tz] ||
      (tz.indexOf("America/") === 0 && /^pt/i.test(navigator.language || "") ? "BR" : "");
  } catch (e) {}
  if (!cfg.countries.some(function (c) { return c.code === here; })) here = "";
  var field = function (f) {
    var input = '<input data-f type="' + f.input + '" maxlength="200" autocomplete="' + f.autoComplete + '" placeholder="' + f.placeholder + '"' + (f.required ? ' required' : '') + '>';
    if (f.phone) input = '<div class="row"><select name="dial" aria-label="Indicativo">' + cfg.countries.map(function (c) { return '<option value="' + c.dial + '"' + ((here ? c.code === here : c.on) ? ' selected' : '') + '>' + c.label + '</option>'; }).join('') + '</select>' + input + '</div>';
    return '<label><span>' + f.label + (f.required ? ' <b class="req">*</b>' : '') + '</span>' + input + '</label>';
  };
  root.innerHTML =
    '<style>' +
    ':host{all:initial}form{font:15px/1.4 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#111;display:grid;gap:12px;max-width:420px}' +
    'label{display:grid;gap:6px;font-size:13px;font-weight:600}input:not([type=checkbox]),select{font:inherit;min-width:0;padding:11px 12px;border:1px solid #d4d4d8;border-radius:10px;background:#fff;color:#111}' +
    '.row{display:flex;gap:8px}.row input{flex:1}.req{color:' + cfg.color + '}' +
    'input:focus,select:focus{outline:2px solid ' + cfg.color + ';outline-offset:1px}.consent{display:flex;gap:8px;align-items:flex-start;font-weight:400;font-size:12px;color:#444}' +
    'button{font:inherit;font-weight:700;padding:13px;border:0;border-radius:10px;background:' + cfg.color + ';color:' + cfg.colorText + ';cursor:pointer}button[disabled]{opacity:.6;cursor:wait}' +
    '.err{color:#b91c1c;font-size:12px;font-weight:500}.ok{font:600 15px/1.4 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:420px;padding:14px;border-radius:10px;background:#ecfdf5;color:#065f46}.hp{position:absolute;left:-9999px}' +
    '.ok a{display:block;margin-top:10px;padding:12px;border-radius:10px;font-weight:700;text-align:center;text-decoration:none}.room{background:' + cfg.color + ';color:' + cfg.colorText + '}.wa{background:#25D366;color:#0B141A}' +
    '</style>' +
    '<form novalidate>' +
    cfg.fields.map(field).join('') +
    (cfg.consent ? '<label class="consent"><input type="checkbox" name="consent" required><span>' + cfg.consent + '</span></label>' : '') +
    '<input class="hp" type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">' +
    '<div class="err" role="alert"></div>' +
    '<button type="submit">' + cfg.button + '</button>' +
    '</form>';
  var form = root.querySelector("form");
  var err = root.querySelector(".err");
  // A origem é a da página de entrada: guardada na sessão do browser para quem navega no
  // site antes de se inscrever (a página do formulário já não traz as UTM nem o referrer).
  var params = new URLSearchParams(location.search);
  var keys = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];
  var utm = {};
  keys.forEach(function (k) { var v = params.get(k); if (v) utm[k] = v; });
  var ref = document.referrer || null;
  try {
    if (Object.keys(utm).length) sessionStorage.setItem("cw_utm", JSON.stringify(utm));
    else utm = JSON.parse(sessionStorage.getItem("cw_utm") || "{}");
    if (ref && new URL(ref).host !== location.host) sessionStorage.setItem("cw_ref", ref);
    else ref = sessionStorage.getItem("cw_ref") || ref;
  } catch (e) {}
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var button = form.querySelector("button");
    var val = function (n) { var el = form.querySelector('[name="' + n + '"]'); return el ? (el.type === "checkbox" ? el.checked : el.value) : null; };
    var inputs = form.querySelectorAll("[data-f]");
    var answers = {};
    var payload = {
      form_id: cfg.formId, submission_id: sid, consent: cfg.consent ? val("consent") : null,
      utm_source: utm.utm_source || null, utm_medium: utm.utm_medium || null, utm_campaign: utm.utm_campaign || null,
      utm_content: utm.utm_content || null, utm_term: utm.utm_term || null,
      referrer: ref, page_url: location.href,
      device: window.matchMedia && matchMedia("(max-width: 767px)").matches ? "mobile" : "desktop",
      website: val("website")
    };
    // Os campos da etapa Página: nome, e-mail e WhatsApp (com o indicativo) soltos; os outros em «answers».
    cfg.fields.forEach(function (f, i) {
      var v = inputs[i] ? inputs[i].value.trim() : "";
      if (f.phone && v) v = val("dial") + " " + v.replace(/[^0-9\\s()-]/g, "");
      if (f.base) payload[f.key] = v || null; else if (v) answers[f.key] = v;
    });
    payload.answers = answers;
    err.textContent = ""; button.disabled = true;
    fetch(cfg.endpoint, { method: "POST", headers: { "content-type": "application/json", "x-novawebinar-embed": "1" }, body: JSON.stringify(payload) })
      .then(function (r) { return r.json().then(function (b) { return { ok: r.ok, body: b }; }); })
      .then(function (res) {
        if (!res.ok) {
          var f = res.body.fields || {};
          err.textContent = f[Object.keys(f)[0]] || res.body.message || "Não foi possível concluir a inscrição.";
          button.disabled = false; return;
        }
        if (res.body.redirect_url) { location.href = res.body.redirect_url; return; }
        var ok = document.createElement("div"); ok.className = "ok"; ok.textContent = res.body.message || "Inscrição confirmada.";
        // Os endereços vão como propriedade (nunca por innerHTML) e só http(s).
        var link = function (href, cls, text) {
          if (typeof href !== "string" || !/^https?:/.test(href)) return;
          var a = document.createElement("a"); a.className = cls; a.href = href;
          a.target = "_blank"; a.rel = "noopener noreferrer"; a.textContent = text;
          ok.appendChild(a);
        };
        // A sala, com quem é a pessoa (?nome=&email=, como a sala lê): o cartão abre já preenchido.
        var room = res.body.room_url;
        var who = new URLSearchParams();
        if (payload.name) who.set("nome", payload.name);
        if (payload.email) who.set("email", payload.email);
        if (typeof room === "string" && who.toString()) room += (room.indexOf("?") < 0 ? "?" : "&") + who;
        link(room, "room", "Abrir a sala");
        // Convite do grupo do fluxo.
        link(res.body.group_url, "wa", "Entrar no grupo de WhatsApp");
        form.replaceWith(ok);
      })
      .catch(function () { err.textContent = "Sem ligação. Tente outra vez."; button.disabled = false; });
  });
})();
`);
      },
    },
  },
});
