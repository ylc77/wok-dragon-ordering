import { getSupabaseClient } from './getSupabaseClient';
import { withMemoryCache } from './memoryCache';
import type { RestaurantSettings } from './types';

const PUBLIC_SETTINGS_CACHE_MS = 5 * 60 * 1000;
const RESTAURANT_SETTINGS_FIELDS = 'id,name_zh,name_en,name_el,logo_url,hero_image_url,intro_zh,intro_en,intro_el,phone,whatsapp_url,instagram_url,address_zh,address_en,address_el,map_url,opening_hours_zh,opening_hours_en,opening_hours_el,wolt_url,efood_url,box_url,accept_pos_payment,accept_cash_payment,ordering_enabled,ordering_paused_at,brand_color,favicon_url,meta_title,footer_text_zh,footer_text_en,footer_text_el,enable_pos,enable_qr_ordering,created_at,updated_at';

async function fetchPublicRestaurantSettings(): Promise<RestaurantSettings | null> {
  const supabase = await getSupabaseClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('restaurant_settings')
    .select(RESTAURANT_SETTINGS_FIELDS)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function getPublicRestaurantSettings(): Promise<RestaurantSettings | null> {
  return withMemoryCache('restaurant-settings:public', PUBLIC_SETTINGS_CACHE_MS, fetchPublicRestaurantSettings);
}
