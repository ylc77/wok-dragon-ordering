import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const demoMenu = readFileSync(new URL('../../supabase/demo-menu.sql', import.meta.url), 'utf8');

describe('template demo data contracts', () => {
  it('uses a fictional editable restaurant identity', () => {
    expect(demoMenu).toContain('EMBER WOK KITCHEN');
    expect(demoMenu).toContain('18 Example Street, Central Athens');
    expect(demoMenu).toContain('+30 210 000 0000');
  });

  it('uses UUID category identifiers compatible with the database schema', () => {
    expect(demoMenu).toContain("'a1000000-0000-4000-8000-000000000001'");
    expect(demoMenu).not.toContain("'ember-small'");
  });

  it('preserves order history and closes old table sessions before inserting fresh demo QR tables', () => {
    const sessions = demoMenu.indexOf('update public.table_sessions');
    const tables = demoMenu.indexOf('insert into public.restaurant_tables');
    expect(sessions).toBeGreaterThan(-1);
    expect(tables).toBeGreaterThan(sessions);
    expect(demoMenu).not.toContain('update public.orders');
    expect(demoMenu).not.toContain('delete from public.orders');
    expect(demoMenu).not.toContain('delete from public.order_items');
  });

  it('does not carry the former restaurant or external menu image data', () => {
    expect(demoMenu).not.toMatch(/wok dragon|wolt|e-food|imageproxy/i);
    expect(demoMenu).not.toMatch(/https?:\/\//i);
  });
});
