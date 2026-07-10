import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const clientInit = readFileSync(new URL('../../supabase/client-init.sql', import.meta.url), 'utf8');
const reservationModule = readFileSync(new URL('../../supabase/reservations-module.sql', import.meta.url), 'utf8');

describe('reservation database contracts', () => {
  it('keeps reservation writes behind the server-only RPC', () => {
    expect(clientInit).toContain('create or replace function public.create_reservation');
    expect(clientInit).toContain('revoke insert, update, delete on table public.reservations from authenticated');
    expect(clientInit).toContain('grant execute on function public.create_reservation(date, time, integer, text, text, text) to service_role');
    expect(clientInit).not.toContain('grant execute on function public.create_reservation(date, time, integer, text, text, text) to anon, authenticated');
  });

  it('enforces capacity with an advisory lock before creating a reservation', () => {
    expect(clientInit).toContain("pg_advisory_xact_lock(hashtext('reservation:'");
    expect(clientInit).toContain('booked_capacity + p_party_size > s.capacity_per_slot');
  });

  it('keeps the reservation module free of automatic external notifications', () => {
    expect(clientInit).not.toContain('telegram_notified_at');
    expect(reservationModule).not.toContain('telegram_notified_at');
  });
});
