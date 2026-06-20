import { hasSupabaseConfig, supabase } from './supabase';
import type { MenuCategory, MenuGroup, MenuItem, RestaurantSettings } from './types';

export async function getRestaurantSettings(): Promise<RestaurantSettings | null> {
  if (!hasSupabaseConfig || !supabase) return null;

  const { data, error } = await supabase
    .from('restaurant_settings')
    .select('*')
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
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
  if (!hasSupabaseConfig || !supabase) return [];

  const [{ data: categories, error: catError }, { data: items, error: itemError }] =
    await Promise.all([
      supabase
        .from('menu_categories')
        .select('*')
        .is('deleted_at', null)
        .eq('is_active', true)
        .order('sort_order', { ascending: true }),
      supabase
        .from('menu_items')
        .select('*')
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
