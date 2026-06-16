# Wok Dragon Express Restaurant App

React + Vite + Supabase implementation for a restaurant website, QR table ordering MVP, Wolt-derived menu seed data, and Chinese admin panel.

## Setup

1. Create a Supabase project and enable Anonymous Sign-Ins in Auth settings.
2. Run `supabase/schema.sql` in Supabase SQL Editor.
3. Run `supabase/seed.sql` to load restaurant info and Wolt-derived menu data.
4. Create the first admin email user in Supabase Auth, then insert one row into `public.profiles` with `role = 'admin'`.
5. Copy `.env.example` to `.env.local` and fill in the public Supabase URL and publishable/anon key. Never put a service role key in the frontend.
6. Install dependencies and start the app:

```bash
pnpm install
pnpm dev
```

## Important Notes

- Menu content is stored in Supabase, not in React components and not in i18n files.
- Fixed frontend UI copy is managed by i18n.
- Backend UI is Chinese only.
- Wolt menu prices in `supabase/seed.sql` come from a public delivery platform and may differ from dine-in prices.
- Customer QR links use `/table/:qrToken`, not table numbers.
- Anonymous QR customers are Supabase `authenticated` users without `profiles` rows.
- `join_table_session`, cart mutations, `submit_order`, and `close_table_session` are Supabase RPC functions.
- Submitting an order creates an order snapshot and clears the current cart, but keeps the table session active for adding more dishes.
- Staff should use "清桌" to close the active table session before the next guests sit down.
- Vercel SPA fallback is configured in `vercel.json` so direct `/table/:qrToken` and `/admin` visits load the React app.
