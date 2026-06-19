import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const schema = readFileSync(new URL('../../supabase/schema.sql', import.meta.url), 'utf8');

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
    expect(latestFunction('request_bill')).toContain(
      'if exists (select 1 from cart_items where session_id = p_session_id)',
    );
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
});
