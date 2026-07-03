import { getSupabaseClient } from './getSupabaseClient';
import { withMemoryCache } from './memoryCache';
import type { MenuCategory, MenuGroup, MenuItem } from './types';

const PUBLIC_MENU_CACHE_MS = 60 * 1000;
const HOME_MENU_PREVIEW_CACHE_MS = 5 * 60 * 1000;

const PUBLIC_CATEGORY_FIELDS = 'id,name_zh,name_en,name_el,sort_order,is_active';
const PUBLIC_MENU_ITEM_FIELDS = 'id,category_id,name_zh,name_en,name_el,description_zh,description_en,description_el,price,image_url,is_available,is_sold_out,sort_order,options';
const HOME_MENU_ITEM_FIELDS = 'id,category_id,name_zh,name_en,name_el,description_zh,description_en,description_el,price,image_url,is_available,is_sold_out,sort_order';
const HOME_MENU_COUNT_FIELDS = 'id,category_id';

export async function getPublicMenu(): Promise<MenuGroup[]> {
  return withMemoryCache('public-menu:v1', PUBLIC_MENU_CACHE_MS, loadPublicMenu);
}

async function loadPublicMenu(): Promise<MenuGroup[]> {
  const supabase = await getSupabaseClient();
  if (!supabase) return [];

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
    const supabase = await getSupabaseClient();
    if (!supabase) return { groups: [], featuredItems: [] };

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
