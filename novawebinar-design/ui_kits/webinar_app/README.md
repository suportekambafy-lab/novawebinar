# Novawebinar App — UI kit (mobile)

Mobile Painel for the Novawebinar creator app. Section order follows the reference screenshot `uploads/IMG_8081.png`; visuals use this design system (Plus Jakarta Sans, 32px cards, pill buttons, orange primary).

- `index.html` — 390×844 phone frame: AppHeader, scroll area, support FAB, BottomNav (tab persisted in localStorage).
- `PainelScreen.jsx` — `AppHeader` (menu, bell + unread badge, initials avatar), `PainelScreen` (greeting → "Novo webinar" → Estúdio hero card → 4 stat cards), `EmptyTab`.

Sequence: Olá, {nome} · Resumo operacional · **Novo webinar** (orange) · Estúdio Novawebinar hero (black card, orange CTA "Continuar configuração") · Participantes reais / Webinars criados / Tempo médio / Conversão no CTA · tab bar Painel / Webinars / Calendário / Definições.

Webinars, Calendário and Definições are empty placeholders until defined. "Tempo médio" and "Conversão no CTA" values are sample data (cut off in the reference).
