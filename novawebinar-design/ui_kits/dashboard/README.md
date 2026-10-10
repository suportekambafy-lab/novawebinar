# Novawebinar Dashboard — UI kit

Hi-fi click-through recreation of the Novawebinar CRM & analytics web app, rebuilt from the case-study screenshots in `uploads/` (no code or Figma was available).

- `index.html` — app shell; top nav switches screens (tab persisted in localStorage).
- `TopBar.jsx` — wordmark, NavTabs, collaborator AvatarStack + Shared, notifications, user avatar.
- `PageShell.jsx` — back button, breadcrumb, page title, toolbar slot, SideRail + support button.
- `DashboardScreen.jsx` — "Product Sales Performance": Pro Version promo (closable), Activity, Comparison of Revenue, Total Spend, Virtual Cards.
- `AnalyticsScreen.jsx` — "Your Sales Analysis": three Today revenue cards, Sales Funnel, Order heatmap. Also `PlaceholderScreen` for Pulse / Data, which the source never shows.

Interactions: switch tabs, close the Pro Version card, click under the Activity bars to move the highlight, click "Monthly" to toggle the period label.
