import { supabase } from './supabase';
import type { Reservation, ReservationSettings, ReservationSlot, ReservationStatus } from './types';

function requireClient() {
  if (!supabase) throw new Error('Supabase is not configured.');
  return supabase;
}

export async function getPublicReservationSettings() {
  const { data, error } = await requireClient()
    .from('reservation_settings')
    .select('id,is_enabled,timezone,open_time,close_time,slot_interval_minutes,capacity_per_slot,max_party_size,max_advance_days,minimum_notice_minutes')
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as ReservationSettings | null;
}

export async function getReservationSlots(date: string) {
  const { data, error } = await requireClient().rpc('get_reservation_slots', { p_date: date });
  if (error) throw error;
  return (data ?? []) as ReservationSlot[];
}

export async function createReservation(input: {
  date: string;
  time: string;
  partySize: number;
  guestName: string;
  phone: string;
  note?: string;
}) {
  const response = await fetch('/api/reservations/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Reservation could not be created.');
  return payload as { reservation_id: string; reference_code: string; reservation_status: ReservationStatus };
}

export async function getAdminReservations() {
  const { data, error } = await requireClient()
    .from('reservations')
    .select('id,reference_code,reservation_date,reservation_time,party_size,guest_name,phone,note,status,created_at,updated_at')
    .order('reservation_date', { ascending: true })
    .order('reservation_time', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Reservation[];
}

export async function updateReservationStatus(id: string, status: ReservationStatus) {
  const patch: Partial<Reservation> & { cancelled_at?: string | null } = {
    status,
    cancelled_at: status === 'cancelled' ? new Date().toISOString() : null,
  };
  const { error } = await requireClient().from('reservations').update(patch).eq('id', id);
  if (error) throw error;
}

export async function updateReservationSettings(settings: ReservationSettings) {
  const { error } = await requireClient().from('reservation_settings').update({
    is_enabled: settings.is_enabled,
    open_time: settings.open_time,
    close_time: settings.close_time,
    slot_interval_minutes: Number(settings.slot_interval_minutes),
    capacity_per_slot: Number(settings.capacity_per_slot),
    max_party_size: Number(settings.max_party_size),
    max_advance_days: Number(settings.max_advance_days),
    minimum_notice_minutes: Number(settings.minimum_notice_minutes),
  }).eq('id', settings.id);
  if (error) throw error;
}
