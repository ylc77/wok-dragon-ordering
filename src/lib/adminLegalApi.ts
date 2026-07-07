import { supabase } from './supabase';
import { normalizeLegalSettings } from './legalTypes';
import type { LegalSettings, LegalSettingsVersion } from './legalTypes';

function requireClient() {
  if (!supabase) throw new Error('Supabase is not configured.');
  return supabase;
}

function toSavePayload(settings: LegalSettings) {
  return {
    project_type: settings.project_type,
    business_name: settings.business_name,
    legal_name: settings.legal_name,
    business_address: settings.business_address,
    vat_number: settings.vat_number,
    gemi_number: settings.gemi_number,
    country: settings.country,
    phone: settings.phone,
    contact_email: settings.contact_email,
    data_controller_name: settings.data_controller_name,
    data_controller_address: settings.data_controller_address,
    privacy_request_email: settings.privacy_request_email,
    privacy_request_instructions: settings.privacy_request_instructions,
    service_flags: settings.service_flags,
    other_service_notes: settings.other_service_notes,
    essential_cookie_note: settings.essential_cookie_note,
    analytics_cookies_enabled: settings.analytics_cookies_enabled,
    error_monitoring_enabled: settings.error_monitoring_enabled,
    advertising_cookies_enabled: settings.advertising_cookies_enabled,
    cookie_last_updated: settings.cookie_last_updated,
    order_terms: settings.order_terms,
    cancellation_policy: settings.cancellation_policy,
    payment_terms: settings.payment_terms,
    allergen_disclaimer: settings.allergen_disclaimer,
    kitchen_receipt_disclaimer: settings.kitchen_receipt_disclaimer,
    official_receipt_disclaimer: settings.official_receipt_disclaimer,
    shipping_policy: settings.shipping_policy,
    return_policy: settings.return_policy,
    refund_policy: settings.refund_policy,
    withdrawal_right: settings.withdrawal_right,
    return_address: settings.return_address,
    return_shipping_responsibility: settings.return_shipping_responsibility,
    excluded_return_items: settings.excluded_return_items,
    data_retention: settings.data_retention,
    last_updated: settings.last_updated,
    confirmations: settings.confirmations,
  };
}

export async function fetchLegalSettingsDraft(): Promise<LegalSettings> {
  const client = requireClient();
  const { data, error } = await client
    .from('legal_settings')
    .select('*')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return normalizeLegalSettings(data as Partial<LegalSettings> | null);
}

export async function saveLegalSettingsDraft(settings: LegalSettings): Promise<LegalSettings> {
  const client = requireClient();
  if (!settings.id) {
    const { data, error } = await client
      .from('legal_settings')
      .insert(toSavePayload(settings))
      .select('*')
      .single();
    if (error) throw error;
    return normalizeLegalSettings(data as Partial<LegalSettings>);
  }

  const { data, error } = await client
    .from('legal_settings')
    .update({ ...toSavePayload(settings), status: 'draft' })
    .eq('id', settings.id)
    .select('*')
    .single();
  if (error) throw error;
  return normalizeLegalSettings(data as Partial<LegalSettings>);
}

export async function fetchLegalVersions(): Promise<LegalSettingsVersion[]> {
  const client = requireClient();
  const { data, error } = await client
    .from('legal_settings_versions')
    .select('id,version_no,settings_id,snapshot,is_current,published_at,published_by,last_updated')
    .order('published_at', { ascending: false })
    .limit(10);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    ...row,
    snapshot: normalizeLegalSettings(row.snapshot as Partial<LegalSettings>),
  })) as LegalSettingsVersion[];
}

export async function publishLegalSettings(settings: LegalSettings): Promise<LegalSettingsVersion> {
  const client = requireClient();
  const saved = await saveLegalSettingsDraft(settings);
  const { count, error: countError } = await client
    .from('legal_settings_versions')
    .select('id', { count: 'exact', head: true });
  if (countError) throw countError;

  const versionNo = `v${(count ?? 0) + 1}`;
  const { data: authData } = await client.auth.getUser();
  const { error: clearCurrentError } = await client
    .from('legal_settings_versions')
    .update({ is_current: false })
    .eq('is_current', true);
  if (clearCurrentError) throw clearCurrentError;

  const snapshot = normalizeLegalSettings({ ...saved, status: 'published', current_version: versionNo });
  const { data, error } = await client
    .from('legal_settings_versions')
    .insert({
      settings_id: saved.id,
      version_no: versionNo,
      snapshot,
      is_current: true,
      published_by: authData.user?.id ?? null,
      last_updated: saved.last_updated,
    })
    .select('id,version_no,settings_id,snapshot,is_current,published_at,published_by,last_updated')
    .single();
  if (error) throw error;

  const { error: updateError } = await client
    .from('legal_settings')
    .update({
      status: 'published',
      current_version: versionNo,
      last_published_at: data.published_at,
    })
    .eq('id', saved.id);
  if (updateError) throw updateError;

  return {
    ...data,
    snapshot: normalizeLegalSettings(data.snapshot as Partial<LegalSettings>),
  } as LegalSettingsVersion;
}
