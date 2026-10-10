# Novawebinar — Sala ao vivo (mobile)

Attendee view of a simulated live webinar. Brand orange stays on conversion actions; the only red is the generic "AO VIVO" live convention (`--live-red`). Two themes via `tokens/room.css`: dark "Grafite neutro" (default, `:root`) and light (`[data-room-theme="light"]`). Toggle with the sun/moon button next to the title; choice persists in localStorage. The player stays dark in both themes.

- `temas.html` — both themes side by side (claro + escuro), each with its own toggle.
- `RoomParts.jsx` — `LiveBadge` (pulsing dot + viewer count), `Player` (16:9 placeholder, mute/fullscreen), `OfferCard` (countdown + orange CTA), `ChatMessage` (host badge), `PurchaseToast`.
- `RoomScreen.jsx` — scripted chat (new message every 2.4s), viewer count drift, offer appears at 6s with 15:00 countdown, purchase notifications every 7s, user can type in chat.

Video is a placeholder. Offer, prices, names and cities are sample data.
