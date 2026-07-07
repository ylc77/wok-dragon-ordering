import { getSupabaseClient } from './getSupabaseClient';
import { withMemoryCache } from './memoryCache';
import { normalizeLegalSettings } from './legalTypes';
import type { LegalSettings, LegalSettingsVersion } from './legalTypes';

const PUBLIC_LEGAL_CACHE_MS = 5 * 60 * 1000;

async function fetchPublishedLegalVersion(): Promise<LegalSettingsVersion | null> {
  const supabase = await getSupabaseClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('legal_settings_versions')
    .select('id,version_no,settings_id,snapshot,is_current,published_at,published_by,last_updated')
    .eq('is_current', true)
    .order('published_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (error.code === '42P01' || error.code === '42501') return null;
    throw error;
  }

  if (!data) return null;
  return {
    ...data,
    snapshot: normalizeLegalSettings(data.snapshot as Partial<LegalSettings>),
  } as LegalSettingsVersion;
}

export async function getPublishedLegalVersion(): Promise<LegalSettingsVersion | null> {
  return withMemoryCache('legal-settings:published-current', PUBLIC_LEGAL_CACHE_MS, fetchPublishedLegalVersion);
}

export async function getPublishedLegalSettings(): Promise<LegalSettings | null> {
  const version = await getPublishedLegalVersion();
  return version?.snapshot ?? null;
}

