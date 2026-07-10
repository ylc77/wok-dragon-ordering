import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const schema = readFileSync(new URL('../../supabase/schema.sql', import.meta.url), 'utf8');
const clientInit = readFileSync(new URL('../../supabase/client-init.sql', import.meta.url), 'utf8');
const tableDeletePatch = readFileSync(
  new URL('../../supabase/patches/2026-07-10-add-table-delete-rpc.sql', import.meta.url),
  'utf8',
);

function latestFunction(name: string) {
  const marker = `create or replace function public.${name}`;
  const start = schema.lastIndexOf(marker);
  expect(start, `${name} must exist`).toBeGreaterThanOrEqual(0);
  const next = schema.indexOf('create or replace function ', start + marker.length);
  return schema.slice(start, next < 0 ? schema.length : next);
}

describe('database ordering contracts', () => {
  it('does not grant the legacy automatic join RPC', () => {
    expect(schema).not.toContain('grant execute on function public.join_table_session(text) to authenticated');
    expect(schema).toContain('revoke execute on function public.join_table_session(text) from public, anon, authenticated');
  });

  it('guards cart writes and order inserts after bill request', () => {
    expect(schema).toContain('create trigger guard_cart_ordering_open');
    expect(schema).toContain('create trigger guard_order_submission_open');
    expect(schema).toContain("s.bill_request_status = 'none'");
  });

  it('requires an empty cart before requesting the bill', () => {
    const definition = latestFunction('request_bill');
    expect(definition).toContain(
      'if exists (select 1 from cart_items where session_id = p_session_id)',
    );
    expect(definition).toContain('payment method is not enabled');
  });

  it('keeps reusable branding in the existing restaurant settings table', () => {
    for (const field of ['logo_url', 'hero_image_url', 'intro_en', 'whatsapp_url', 'instagram_url']) {
      expect(schema).toContain(`add column if not exists ${field}`);
    }
    expect(schema).toContain('restaurant_settings_payment_method_check');
  });

  it('keeps paid status behind the payment transaction', () => {
    const definition = latestFunction('update_order_status');
    expect(definition).not.toContain("'paid', 'cancelled'");
    expect(definition).toContain('paid orders cannot be changed');
    expect(schema).toContain('create trigger protect_order_history');
    expect(schema).toContain('paid order payment history cannot be changed');
  });

  it('blocks clearing tables with unfinished orders or a pending bill', () => {
    const definition = latestFunction('close_table_session');
    expect(definition).toContain('finish or cancel open orders before clearing the table');
    expect(definition).toContain('confirm the bill request before clearing the table');
  });

  it('supports a global ordering pause without deleting the shared cart', () => {
    expect(schema).toContain('ordering_enabled boolean not null default true');
    expect(schema).toContain('restaurant ordering is temporarily paused');
    expect(schema).toContain("if tg_op = 'UPDATE'");
    expect(schema).toContain('new.quantity >= old.quantity');
    expect(schema).toContain('create or replace function public.set_restaurant_ordering');
  });

  it('paginates complete table sessions and calculates unpaged statistics', () => {
    expect(schema).toContain('create or replace function public.admin_order_page');
    expect(schema).toContain('group by fo.session_id');
    expect(schema).toContain("'total_sessions'");
    expect(schema).toContain('create or replace function public.admin_order_stats');
    expect(schema).toContain("'paid_total'");
  });

  it('keeps all operational admin queries behind the staff check', () => {
    for (const name of ['set_restaurant_ordering', 'admin_order_page', 'admin_order_stats', 'admin_dashboard_summary']) {
      expect(latestFunction(name)).toContain('private.is_staff()');
    }
  });

  it('keeps the table deletion RPC staff-only and prevents history loss', () => {
    for (const source of [clientInit, tableDeletePatch]) {
      expect(source).toContain('create or replace function public.admin_delete_restaurant_table(p_table_id uuid)');
      expect(source).toContain('security definer\nset search_path = public');
      expect(source).toContain('private.is_staff()');
      expect(source).toContain('table has historical sessions or orders; disable it instead of deleting');
      expect(source).toContain('revoke execute on function public.admin_delete_restaurant_table(uuid) from public, anon');
      expect(source).toContain('grant execute on function public.admin_delete_restaurant_table(uuid) to authenticated');
    }
  });
});
