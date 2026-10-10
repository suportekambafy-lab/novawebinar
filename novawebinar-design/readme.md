# Novawebinar Design System

Novawebinar é um agente de IA para webinars automáticos e lives simuladas que vendem. O sistema visual (layout em bento, pílulas, cartões de 32px, gráficos com tracejado) veio de um estudo de caso de CRM ("Orvion") fornecido em capturas de ecrã, e foi rebatizado com o nome Novawebinar, a fonte Plus Jakarta Sans e a paleta Laranja live `#E8440C` + Azul-noite `#0F1B2D` + cinzas claros. Todo o conteúdo dos UI kits e dos cartões está em português (PT) e no contexto de webinars.

## Sources
Product references (feature scope only; visual language comes from the case study below):
- https://novawebinar.com/ — automated webinars: recurring / just-in-time sessions, time-synced chat, scheduled offer, sales notifications, replay, AI support agent, retention analytics
- https://www.hotwebinar.com.br — evergreen webinars: AI chat generator, simulated audience, purchase notifications, A/B/C/D tests, room customization, multi-attendant support, segmented follow-up, integrations

Built only from 11 case-study screenshots (Behance/Dribbble-style presentation) in `uploads/`:
- `CleanShot 2026-09-28 at 22.43.47.png` — hero: dashboard on monitor, giant "Orvion" watermark
- `22.45.27` — project stats ("18+ Screens", "04 Weeks") + testimonial card
- `22.46.09` — Key Results card close-up (range chart)
- `22.47.15` — Dashboard close-up
- `22.48.17` — User Flow diagram
- `22.49.00`, `22.49.33` — Colors & Typography board (Inter; Black / White / Lime Green / Pale Lime)
- `22.50.54`, `22.52.41` — Analytics screen ("Your Sales Analysis")
- `22.52.04` — Design Process & Timeline
- `22.53.26` — "Thanks for scrolling" end card (designer's promo; not product)

No codebase, Figma file, logo file, icon set or font binaries were provided. Every value is estimated from screenshots.

## Index
- `styles.css` — entry point (imports only) → `tokens/fonts.css`, `colors.css`, `typography.css`, `spacing.css`, `effects.css`, `base.css`
- `guidelines/` — cartões de fundamentos (grupos: Marca, Cores, Tipografia, Espaçamento, Efeitos). Componentes no grupo Componentes; UI kits no grupo App Novawebinar.
- `components/` — React primitives (see below), one card per folder
- `ui_kits/dashboard/` — click-through recreation of the app (Dashboard + Analytics)
- `assets/imagery/spheres.png`, `assets/avatars/*.png` — crops from the screenshots (low-res)
- `thumbnail.html`, `SKILL.md`

## Components
- **core/** — `Icon`, `Button`, `IconButton`, `Chip`, `Tag`, `Input`
- **navigation/** — `NavTabs`, `Breadcrumb`, `SideRail`, `BottomNav`
- **data/** — `WidgetCard`, `Metric`, `ProgressRow`, `Avatar`, `AvatarStack`
- **charts/** — `BarChart`, `RangeChart`, `LineChart`, `Heatmap`
- **diagram/** — `FlowNode`

No source defined a component inventory, so this set is derived from what the screens show. **Intentional additions:** `Icon` (wrapper for the Lucide substitute), `Input` (the source shows a search action but no text field; needed for CRM forms).

## UI kits
- `ui_kits/webinar_room/` — mobile live room (attendee view), light + dark (Grafite neutro) themes via `tokens/room.css` (side by side in `ui_kits/webinar_room/temas.html`): dark player, pulsing red AO VIVO badge, orange offer CTA with countdown, scripted chat, purchase toasts. Rule: brand orange for the creator panel and conversion; red only for the live badge.
- `ui_kits/webinar_app/` — mobile Painel (greeting → Novo webinar → Estúdio hero → metrics → tab bar), per `uploads/IMG_8081.png`.
- `ui_kits/dashboard/` — painel desktop (Painel · Análises · Ao vivo · Dados). Ao vivo e Dados estão vazios até serem definidos.

---

## CONTENT FUNDAMENTALS
- **Idioma:** português (PT-PT) em toda a interface: "Painel", "Novo webinar", "Definições", "Ecrã", "Utilizador".
- **Voz:** direta, orientada a resultado e venda. Rótulos são substantivos curtos: "Inscrições", "Presença", "Vendas na oferta", "Funil de vendas".
- **Pessoa:** trata o utilizador por "você" / "a sua" ("A sua análise de vendas", "Os seus ganhos com a versão Pro"). Saudação pelo nome: "Olá, Amado".
- **Maiúsculas:** só a primeira palavra ("Criar relatório", "Tempo médio assistido"). Selos de estado em maiúsculas: "AO VIVO", "OFERTA ESPECIAL".
- **Números em formato pt-PT:** ponto nos milhares, vírgula decimal, símbolo depois do valor: "1.284", "4,2%", "197 €", "3,7 k€", "42 min". Unidade e símbolo em tamanho menor que o número.
- **Ações de venda:** frases na 1.ª pessoa do participante nos CTAs da sala: "Quero garantir a minha vaga". No painel, verbos no infinitivo: "Continuar configuração", "Exportar CSV".
- **Emoji:** nunca na interface. Só aparecem dentro de mensagens de chat simuladas, como os participantes escreveriam.

## VISUAL FOUNDATIONS

> **5/10/2026: o painel segue a estrutura do Geist (vercel.com/geist).** Os valores estão em `tokens/` e prevalecem sobre o resto desta secção.
> - **Cor:** escalas 100–1000 por papel (`--ds-gray-*`, `--ds-blue/red/amber/green-*`). Fundo `#FAFAFA`; cartões, campos e janelas brancos com aresta de 1px; texto `#171717` e `#4D4D4D`.
> - **Acção principal:** preto (`primary`). O laranja (`brand`) fica no logótipo, no ícone activo do menu e na sala.
> - **Letra:** Geist e Geist Mono. Texto a 14px, títulos SemiBold com tracking negativo (heading-32/24/16), botões em Medium.
> - **Forma:** controlos com 32/36/40px de altura e 6px de raio (8px no grande); cartões, menus e janelas com 12px; selos e avatares em pílula.
> - **Sombras e foco:** sombras como os materiais do Geist. O foco é um anel azul com folga, e nos campos uma aresta mais escura com halo cinza.
> - **Sala do participante:** mantém o desenho de baixo (Plus Jakarta Sans, laranja, pílulas). Os ícones do menu não mudaram.
- **Palette** (option B · Azul-noite, chosen from `explorations/paleta-*.html`): Laranja live `#E8440C` (primary: buttons, active states, AO VIVO badges, hero card; hover `#C93A08`, soft `#FDE4D9`) + Azul-noite `#0F1B2D` (text, dark cards, secondary dark buttons; soft `#1C2A40`) + Light gray neutrals (canvas `#F1F3F6`, surface `#FAFBFC`, chip `#E6EAF0`, hairline `#DCE1E8`, text 2 `#56627A`, text 3 `#8792A6`). Azul info `#3B6FE0` is a rare support color (replay, info links).
- **Type:** Plus Jakarta Sans only (Regular 400 / Medium 500 / SemiBold 600 / Bold 700). Regular for titles and numbers, Medium for buttons/labels when emphasis is needed, SemiBold/Bold rarely. Tight negative tracking on anything ≥20px (-0.025 to -0.04em). Scale: Heading 34, Title 28, Body 16 (+ 20 subtitle, 14 label, 12 caption, 10 micro, 56–96 display).
- **Shape:** everything is soft. Cards 32px radius; pills and icon buttons fully round; bars 10–16px; tags 6px; flow nodes 16px. No sharp corners anywhere.
- **Cards:** flat tonal layers — no border, no shadow; they separate from the canvas by a 1-step lighter gray. One inverse card per view (Azul-noite `#0F1B2D`) marks the primary metric. Card header = title left + 2–3 circular icon buttons right (sliders, comment, ↗).
- **Signature motif — diagonal hatch:** 45° gray stripes (`--hatch`) fill the highlighted bar or range band, topped by an accent value tag. Empty heatmap cells use the lighter hatch.
- **Glow:** hub nodes in diagrams get a blurred orange halo behind the label (`FlowNode highlighted`).
- **Transparency & blur:** frosted glass (`--surface-glass`, 18px blur) only where a card overlays imagery (Pro Version → Advantages).
- **Imagery:** 3D-rendered glossy spheres (source crop recolored to brand orange in `assets/imagery/spheres.png`); photographic circular avatars with a canvas-colored ring. Presentation mockups use cool gray, soft studio shadows, occasional leaf shadows. No illustrations, no gradients in UI.
- **Backgrounds:** solid light gray. Case-study pages add a giant faint wordmark watermark behind the hero.
- **Layout:** top bar (logo · nav pills · collaborators · bell/avatar), then back button + breadcrumb + 34px title with a right-aligned pill toolbar, a left vertical rail of circular tools, and a dense bento grid of widgets with 12px gaps.
- **Spacing:** 24px card padding, 12px grid gap, 6–10px between pills, 32px page padding. Control heights 32 / 40 / 48.
- **Shadows:** effectively none in-app. `--shadow-pop` only for floating elements.
- **Hover / press (inferred, not shown):** hover moves fills one gray step darker (navy `#0F1B2D` → `#1C2A40`, orange → `#C93A08`); press scales to .97 (.94 for circles). Transitions 140–220ms, `cubic-bezier(.2,.7,.2,1)`. No bounces.
- **Active state:** selected nav pill / rail button / tab flips to solid orange with white icon; primary buttons are orange with white text.
- **Harmony rules:** only three color families appear together: Laranja live (action, live, highlight), Azul-noite (text, dark surfaces, chart lines/dots) and cool Light grays (canvas, cards, chips, hatch). Chart area fills fade from orange at 12% to transparent; the range-chart marker line is orange; focus rings are orange. Never mix in warm grays or pure black. Exception: the live room dark theme uses neutral graphite (`#141414` / `#1F1F1F`) so the video and orange CTA stand out.
- **Charts:** hairline navy lines and dots, orange highlight + tag, no gridlines or axis lines — only labels (Seg–Dom) in secondary gray.

## ICONOGRAPHY
- Thin outline icons (~1.5px stroke, rounded caps) always sitting inside a circle or pill — never free-floating except in breadcrumbs.
- The original icon set is unknown (resembles Iconsax/Lucide). **Substitution:** Lucide via CDN (`lucide-static@0.454.0`), rendered with stroke 1.5 by the `Icon` component.
- Common: `layout-grid`, `square-activity`, `activity`, `database`, `share`, `bell-ring`, `search`, `sliders-vertical`, `sliders-horizontal`, `calendar`, `plus`, `arrow-left`, `arrow-up-right` (the "open widget" affordance on every card), `message-circle-more`, `x`, `file`, `pen-tool`, `clipboard`, `settings`, `headphones`.
- No emoji, no unicode-as-icon, no icon font.

## Logo
The product mark in the screenshots is a rounded hash-like glyph, but **no logo file was provided**. The wordmark "Novawebinar" is set in plain Plus Jakarta Sans wherever a mark would go. Replace with the real SVG when available.

## Fonts
Plus Jakarta Sans is loaded from Google Fonts (no binaries supplied).

## Standards
- Colors only via tokens (`var(--…)`); no hex in components or UI kits. Dark = `--navy`, never pure black.
- Text on `--accent` is always white; on `--accent-soft` it is `--accent-700`.
- Card groups in the Design System tab: Marca, Cores, Tipografia, Espaçamento, Efeitos, Componentes, App Novawebinar.

## Referências
- **Geist (Vercel), 5/10:** estrutura do painel — neutros 100–1000, letra Geist, controlos 32/36/40 com 6px, cartões 12px, acção principal a preto.
- **Nubank, 9/10:** lógica do site e da auth, com as nossas cores. Primitivos → papéis → temas de superfície (`[data-surface="base|warm|tint|inverse|footer"]` em `src/styles.css`); cada secção tem o seu fundo e o cartão é um degrau da mesma família, sem sombra. Tipografia fluida `--t-*`, botões em pílula de 48px, campos de 48px com raio 8 e aresta `--border-control`. Contraste: `--text-tertiary #6F6F6F`, `#E8440C` como texto só a partir de 24px. Sem faixa laranja. Estudo completo: `.scratch/arnes/design-nubank.md`.
- **Leveza (Angola, dados móveis):** no site e na auth não entram bibliotecas novas; imagens em WebP com `width`/`height` e `loading="lazy"`; letras só do `@fontsource` (subconjunto latin descarregado à medida).
