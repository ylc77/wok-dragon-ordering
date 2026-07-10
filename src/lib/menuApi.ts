import { hasSupabaseConfig, supabase } from './supabase';
import { withMemoryCache } from './memoryCache';
import type { MenuCategory, MenuGroup, MenuItem, RestaurantSettings } from './types';

const PUBLIC_SETTINGS_CACHE_MS = 5 * 60 * 1000;
const PUBLIC_MENU_CACHE_MS = 60 * 1000;
const HOME_MENU_PREVIEW_CACHE_MS = 5 * 60 * 1000;

const RESTAURANT_SETTINGS_FIELDS = 'id,name_zh,name_en,name_el,logo_url,hero_image_url,intro_zh,intro_en,intro_el,phone,whatsapp_url,instagram_url,address_zh,address_en,address_el,map_url,opening_hours_zh,opening_hours_en,opening_hours_el,wolt_url,efood_url,box_url,accept_pos_payment,accept_cash_payment,ordering_enabled,ordering_paused_at,brand_color,favicon_url,meta_title,footer_text_zh,footer_text_en,footer_text_el,enable_pos,enable_qr_ordering,plan_tier,feature_flags,created_at,updated_at';
const PUBLIC_CATEGORY_FIELDS = 'id,name_zh,name_en,name_el,sort_order,is_active';
const PUBLIC_MENU_ITEM_FIELDS = 'id,category_id,name_zh,name_en,name_el,description_zh,description_en,description_el,price,image_url,is_available,is_sold_out,sort_order,options';
const HOME_MENU_ITEM_FIELDS = 'id,category_id,name_zh,name_en,name_el,description_zh,description_en,description_el,price,image_url,is_available,is_sold_out,sort_order';
const HOME_MENU_COUNT_FIELDS = 'id,category_id';

async function fetchRestaurantSettings(): Promise<RestaurantSettings | null> {
  if (!hasSupabaseConfig || !supabase) return null;

  const { data, error } = await supabase
    .from('restaurant_settings')
    .select(RESTAURANT_SETTINGS_FIELDS)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function getRestaurantSettings(): Promise<RestaurantSettings | null> {
  return fetchRestaurantSettings();
}

export async function getPublicRestaurantSettings(): Promise<RestaurantSettings | null> {
  return withMemoryCache('restaurant-settings:public', PUBLIC_SETTINGS_CACHE_MS, fetchRestaurantSettings);
}

export function subscribeToRestaurantSettings(onChange: (settings: RestaurantSettings) => void) {
  if (!supabase) return () => {};
  const client = supabase;
  const channel = client
    .channel(`restaurant-settings-${crypto.randomUUID()}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'restaurant_settings' },
      (payload) => onChange(payload.new as RestaurantSettings),
    )
    .subscribe();
  return () => {
    void client.removeChannel(channel);
  };
}

export async function getPublicMenu(): Promise<MenuGroup[]> {
  return withMemoryCache('public-menu:v1', PUBLIC_MENU_CACHE_MS, loadPublicMenu);
}

async function loadPublicMenu(): Promise<MenuGroup[]> {
  if (!hasSupabaseConfig || !supabase) return [];

  const [{ data: categories, error: catError }, { data: items, error: itemError }] =
    await Promise.all([
      supabase
        .from('menu_categories')
        .select(PUBLIC_CATEGORY_FIELDS)
        .is('deleted_at', null)
        .eq('is_active', true)
        .order('sort_order', { ascending: true }),
      supabase
        .from('menu_items')
        .select(PUBLIC_MENU_ITEM_FIELDS)
        .is('deleted_at', null)
        .eq('is_available', true)
        .order('sort_order', { ascending: true }),
    ]);

  if (catError) throw catError;
  if (itemError) throw itemError;

  const menuItems = (items ?? []) as MenuItem[];
  return ((categories ?? []) as MenuCategory[]).map((category) => ({
    ...category,
    items: menuItems.filter((item) => item.category_id === category.id),
  }));
}

export async function getHomeMenuPreview(limit = 4): Promise<{ groups: MenuGroup[]; featuredItems: MenuItem[] }> {
  const safeLimit = Math.max(1, Math.min(limit, 12));
  return withMemoryCache(`home-menu-preview:${safeLimit}`, HOME_MENU_PREVIEW_CACHE_MS, async () => {
    if (!hasSupabaseConfig || !supabase) return { groups: [], featuredItems: [] };

    const [
      { data: categories, error: catError },
      { data: featured, error: featuredError },
      { data: countItems, error: countError },
    ] = await Promise.all([
      supabase
        .from('menu_categories')
        .select(PUBLIC_CATEGORY_FIELDS)
        .is('deleted_at', null)
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .limit(8),
      supabase
        .from('menu_items')
        .select(HOME_MENU_ITEM_FIELDS)
        .is('deleted_at', null)
        .eq('is_available', true)
        .order('sort_order', { ascending: true })
        .limit(safeLimit),
      supabase
        .from('menu_items')
        .select(HOME_MENU_COUNT_FIELDS)
        .is('deleted_at', null)
        .eq('is_available', true),
    ]);

    if (catError) throw catError;
    if (featuredError) throw featuredError;
    if (countError) throw countError;

    const itemCounts = new Map<string, number>();
    for (const item of (countItems ?? []) as Pick<MenuItem, 'id' | 'category_id'>[]) {
      if (!item.category_id) continue;
      itemCounts.set(item.category_id, (itemCounts.get(item.category_id) ?? 0) + 1);
    }

    return {
      groups: ((categories ?? []) as MenuCategory[]).map((category) => ({
        ...category,
        items: [],
        item_count: itemCounts.get(category.id) ?? 0,
      })),
      featuredItems: (featured ?? []) as MenuItem[],
    };
  });
}

export async function requireAnonymousSession() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  if (data.session) return data.session;
  const { data: anonData, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  return anonData.session;
}

export async function adminHardDeleteMenuItem(itemId: string, password: string) {
  if (!supabase) throw new Error('Supabase 客户端未初始化');
  const { error } = await supabase.rpc('admin_hard_delete_menu_item', {
    p_item_id: itemId,
    p_password: password,
  });
  if (error) throw error;
}

export async function adminHardDeleteMenuCategory(categoryId: string, password: string) {
  if (!supabase) throw new Error('Supabase 客户端未初始化');
  const { error } = await supabase.rpc('admin_hard_delete_menu_category', {
    p_category_id: categoryId,
    p_password: password,
  });
  if (error) throw error;
}

export async function adminSetDeletePassword(password: string) {
  if (!supabase) throw new Error('Supabase 客户端未初始化');
  const { error } = await supabase.rpc('admin_set_delete_password', {
    p_password: password || null,
  });
  if (error) throw error;
}

import { compressImageToWebp } from './imageCompress';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB before compression

export function validateImageFile(file: File): string | null {
  if (!ALLOWED_TYPES.includes(file.type)) return '仅支持 jpg、png、webp 图片';
  if (file.size > MAX_SIZE) return '图片太大（最大 10MB），请先缩小再上传';
  return null;
}

async function uploadCompressed(
  file: File, bucket: string, path: string,
  compressType: 'menuItem' | 'logo' | 'hero',
): Promise<string> {
  if (!supabase) throw new Error('Supabase 客户端未初始化');
  let blob: Blob = file;
  let isWebp = false;
  try { blob = await compressImageToWebp(file, compressType); isWebp = true; } catch { /* 压缩失败用原图 */ }
  const ext = isWebp ? 'webp' : (file.name.split('.').pop() || 'jpg');
  const mime = isWebp ? 'image/webp' : (file.type || 'image/jpeg');
  const f = new File([blob], file.name.replace(/\.[^.]+$/, '.' + ext), { type: mime });
  const { error, data } = await supabase.storage.from(bucket).upload(path, f, { upsert: true, contentType: mime });
  if (error) throw error;
  const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(data.path);
  return urlData.publicUrl;
}

export async function uploadMenuItemImage(file: File, itemId?: string): Promise<string> {
  const prefix = itemId || 'temp';
  const path = `menu-items/${prefix}-${Date.now()}.webp`;
  return uploadCompressed(file, 'menu-images', path, 'menuItem');
}

export async function uploadRestaurantImage(file: File, type: 'logo' | 'hero'): Promise<string> {
  const path = `restaurant/${type}-${Date.now()}.webp`;
  return uploadCompressed(file, 'menu-images', path, type);
}
