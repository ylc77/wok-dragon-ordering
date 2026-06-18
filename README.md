# Wok Dragon Express Restaurant App

React + Vite + Supabase implementation for Wok Dragon Express:

- Restaurant website
- Public menu
- QR table ordering MVP
- Shared table cart with Supabase Realtime
- Chinese admin panel
- Wolt-derived menu seed data
- Dish image URLs managed from Supabase menu data

## Links

- Production: https://wok-dragon-ordering.vercel.app/
- GitHub: https://github.com/ylc77/wok-dragon-ordering.git

## Supabase Environment Variables

The frontend uses only public Supabase client credentials:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-or-anon-key
```

Do not expose or commit the Supabase `service_role` key.

For local development, copy `.env.example` to `.env.local` and fill in the two variables above.
For Vercel, add the same two variables in Project Settings -> Environment Variables for Production and Preview.

## Setup

1. Create a Supabase project.
2. Enable Anonymous Sign-Ins in Supabase Auth settings.
3. Run `supabase/schema.sql` in the Supabase SQL Editor.
4. Run `supabase/seed.sql` to load restaurant information, demo tables, and Wolt-derived menu data.
5. Create the first admin email user in Supabase Auth.
6. Manually insert one `public.profiles` row for that user with `role = 'admin'`.
7. Install dependencies and start the app:

```bash
pnpm install
pnpm dev
```

## Admin Login

Admin users log in at:

```text
/admin
```

The backend UI is Chinese only. Admin/staff permissions are controlled by `public.profiles.role`, not by user metadata.

Anonymous table-ordering customers sign in anonymously through Supabase Auth. They are `authenticated` users, but they do not need `profiles` rows.

## Table QR Code Rules

Customer table links use QR tokens, not table numbers:

```text
/table/:qrToken
```

The production QR URL format is:

```text
https://wok-dragon-ordering.vercel.app/table/:qrToken
```

The admin table page can:

- Create tables such as `Table 1`, `Table 2`, `Table 3`
- Show each table's QR code
- Download a QR image with the table label
- Close the current table session
- Regenerate a table QR token when necessary

## Clear Table vs Regenerate QR

`Clear Table` / `清桌` is the normal daily operation.

- It closes only the current `table_session`.
- It does not change `restaurant_tables.qr_token`.
- The printed QR code on the table remains valid.
- The next guests scanning the same QR code will create a new active session.

`Regenerate QR` / `重生成二维码` is a rare maintenance operation.

- It changes `restaurant_tables.qr_token`.
- The old QR link immediately becomes invalid.
- Any already printed QR code must be printed and replaced again.
- The admin UI shows a strong confirmation prompt before this action.

## Bill And Payment Flow

- Customers request the bill only after submitting at least one non-cancelled order, then choose `pos` or `cash`.
- A bill request notifies staff but does not close the table session.
- Staff confirmation marks all non-cancelled session orders as paid, records the payment method, clears unsubmitted cart items, handles the bill request, and closes the session atomically.
- The device that joined a session remembers that session for the QR token. If staff closes it, refreshing that old page shows the ended-session message instead of joining the next guests' session.
- A new device scanning the unchanged QR token can create or join the next active session.

## Ordering Flow

- Each table can have only one active `table_session`.
- Multiple devices scanning the same table QR join the same session.
- The shared cart syncs through Supabase Realtime.
- Cart writes go through RPC functions, so the frontend cannot set `unit_price`.
- `submit_order(session_id, client_request_id)` creates an order snapshot and clears the current cart.
- Submitting an order does not close the table session, so guests can continue adding dishes.
- Historical `orders` and `order_items` are preserved after dishes are edited or marked unavailable.

## Menu Images And Delivery Links

- Dish images are read from `menu_items.image_url`; React components do not hardcode menu images.
- If a dish has no image URL, or the remote image cannot load, the frontend falls back to a neutral placeholder.
- Admin users can edit each dish's `image_url` from the Chinese menu management page.
- The homepage reads `restaurant_settings.wolt_url`, `restaurant_settings.efood_url`, and `restaurant_settings.box_url`.
- Delivery platform buttons are shown only when the matching URL is configured, and open in a new browser tab.
- `supabase/patches/2026-06-delivery-links.sql` can update an existing Supabase project with the currently found public delivery links.
- For long-term production use, upload restaurant-owned dish photos to Supabase Storage or another authorized image host, then paste those URLs into `menu_items.image_url`.

## Deployment Notes

The project is a React + Vite SPA. Vercel fallback is configured in `vercel.json`, so direct visits to these routes work:

```text
/
/menu
/table/:qrToken
/admin
```

Run before pushing deployment changes:

```bash
pnpm build
```

## Kitchen Ticket Printing

- The Chinese admin order page can enable automatic kitchen-ticket printing for new `pending` orders received through Supabase Realtime.
- Automatic printing only claims orders whose `kitchen_printed_at` is empty. Each later add-on order is a new order and prints only its own item snapshot.
- Kitchen tickets are operational kitchen order slips, not formal tax receipts.
- The first version uses the browser print window, so the browser or operating system may still show a print confirmation dialog.
- Keep the dedicated automatic-print window open and allow popups for the admin site.
- Fully unattended paper printing requires a later ESC/POS printer integration or a local print service.

## Important Notes

- Menu content is stored in Supabase, not in React components and not in i18n files.
- Fixed frontend UI copy is managed by i18n.
- Backend UI is Chinese only.
- Wolt menu prices in `supabase/seed.sql` come from a public delivery platform and may differ from dine-in prices.
- Some seed image URLs come from public delivery platform pages as temporary references; confirm authorization or replace them with restaurant-owned photos before formal commercial use.
- First-stage MVP intentionally does not include online payment, membership, inventory, printer integration, delivery fulfillment, or complex coupons.
