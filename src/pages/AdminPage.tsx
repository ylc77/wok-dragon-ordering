import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { Ban, Banknote, BarChart3, Building2, CheckCircle2, ChefHat, ChevronDown, Clock3, ClipboardList, Copy, CreditCard, Database, Download, LayoutDashboard, LogOut, Pencil, Plus, Printer, QrCode, RefreshCw, RotateCcw, Save, Search, Settings2, Tags, Trash2, Upload, UserCircle, UtensilsCrossed, WalletCards } from 'lucide-react';
import { formatPrice } from '../lib/localized';
import { hasSupabaseConfig, supabase } from '../lib/supabase';
import {
  closeTableSession,
  confirmBillAndCloseSession,
  createRestaurantTable,
  fetchActiveSessions,
  fetchAdminOrders,
  fetchPendingBillRequests,
  fetchRestaurantTables,
  markOrderKitchenPrinted,
  regenerateTableQrToken,
  saveRestaurantTable,
  subscribeToAdminOrders,
  updateOrderStatus,
} from '../lib/orderApi';
import type {
  BillRequest,
  MenuCategory,
  MenuItem,
  Order,
  OrderStatus,
  RestaurantSettings,
  RestaurantTable,
  TableSession,
} from '../lib/types';

type AdminTab = 'dashboard' | 'settings' | 'categories' | 'items' | 'orders' | 'tables' | 'import' | 'system';

const emptySettings: Partial<RestaurantSettings> = {
  name_zh: '',
  name_en: '',
  name_el: '',
  phone: '',
  address_zh: '',
  address_en: '',
  address_el: '',
  map_url: '',
  opening_hours_zh: '',
  opening_hours_en: '',
  opening_hours_el: '',
  wolt_url: '',
  efood_url: '',
  box_url: '',
};

const emptyCategory: Partial<MenuCategory> = {
  name_zh: '',
  name_en: '',
  name_el: '',
  sort_order: 0,
  is_active: true,
};

const emptyItem: Partial<MenuItem> = {
  category_id: '',
  name_zh: '',
  name_en: '',
  name_el: '',
  description_zh: '',
  description_en: '',
  description_el: '',
  price: 0,
  image_url: '',
  is_available: true,
  sort_order: 0,
};

const publicSiteUrl = 'https://wok-dragon-ordering.vercel.app';

const statusLabels: Record<OrderStatus, string> = {
  pending: '待处理',
  preparing: '制作中',
  served: '已上菜',
  paid: '已付款',
  cancelled: '已取消',
};

const statusIcons: Record<OrderStatus, ReactNode> = {
  pending: <Clock3 size={16} />,
  preparing: <ChefHat size={16} />,
  served: <CheckCircle2 size={16} />,
  paid: <WalletCards size={16} />,
  cancelled: <Ban size={16} />,
};

export function AdminPage() {
  const [sessionReady, setSessionReady] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [adminEmail, setAdminEmail] = useState('管理员');
  const [tab, setTab] = useState<AdminTab>('dashboard');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setLoggedIn(Boolean(data.session));
      setAdminEmail(data.session?.user.email ?? '管理员');
      setSessionReady(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setLoggedIn(Boolean(session));
      setAdminEmail(session?.user.email ?? '管理员');
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  if (!hasSupabaseConfig || !supabase) {
    return (
      <main className="admin-shell">
        <div className="admin-empty">
          <h1>后台管理</h1>
          <p>请先配置 `.env.local` 中的 Supabase URL 和 publishable key。</p>
        </div>
      </main>
    );
  }

  if (!sessionReady) {
    return <main className="admin-shell">正在加载后台...</main>;
  }

  if (!loggedIn) {
    return <AdminLogin onMessage={setMessage} message={message} />;
  }

  return (
    <main className="admin-shell">
      <aside className="admin-sidebar">
        <Link className="admin-brand" to="/">
          <span className="admin-brand-mark">龙</span>
          <span>后台管理系统<small>Wok Dragon Express</small></span>
        </Link>
        <span className="admin-nav-label">经营管理</span>
        <AdminNavButton icon={<LayoutDashboard size={17} />} active={tab === 'dashboard'} onClick={() => setTab('dashboard')}>
          仪表盘
        </AdminNavButton>
        <AdminNavButton icon={<ClipboardList size={17} />} active={tab === 'orders'} onClick={() => setTab('orders')}>
          订单管理
        </AdminNavButton>
        <span className="admin-nav-label">菜单与桌台</span>
        <AdminNavButton icon={<UtensilsCrossed size={17} />} active={tab === 'items'} onClick={() => setTab('items')}>
          菜品管理
        </AdminNavButton>
        <AdminNavButton icon={<Tags size={17} />} active={tab === 'categories'} onClick={() => setTab('categories')}>
          菜品分类
        </AdminNavButton>
        <AdminNavButton icon={<QrCode size={17} />} active={tab === 'tables'} onClick={() => setTab('tables')}>
          桌台二维码
        </AdminNavButton>
        <span className="admin-nav-label">系统配置</span>
        <AdminNavButton icon={<Building2 size={17} />} active={tab === 'settings'} onClick={() => setTab('settings')}>
          餐馆信息设置
        </AdminNavButton>
        <AdminNavButton icon={<Database size={17} />} active={tab === 'import'} onClick={() => setTab('import')}>
          CSV 导入
        </AdminNavButton>
        <AdminNavButton icon={<Settings2 size={17} />} active={tab === 'system'} onClick={() => setTab('system')}>
          系统设置
        </AdminNavButton>
        <button
          className="danger"
          onClick={() => supabase?.auth.signOut().then(() => setLoggedIn(false))}
        >
          <LogOut size={16} />
          退出登录
        </button>
      </aside>
      <div className="admin-workspace">
        <header className="admin-topbar">
          <strong>Wok Dragon Express 管理后台</strong>
          <div>
            <label className="admin-restaurant-select">
              <Building2 size={16} />
              <select aria-label="餐馆选择" defaultValue="wok-dragon">
                <option value="wok-dragon">Wok Dragon Express 龙城酒楼</option>
              </select>
              <ChevronDown size={14} />
            </label>
            <span className="admin-user"><UserCircle size={19} /><b>{adminEmail}</b></span>
          </div>
        </header>
        <section className="admin-content">
          {message ? <p className="admin-message">{message}</p> : null}
          {tab === 'dashboard' ? <Dashboard onMessage={setMessage} onOpenOrders={() => setTab('orders')} /> : null}
          {tab === 'orders' ? <OrderManager onMessage={setMessage} /> : null}
          {tab === 'tables' ? <TableManager onMessage={setMessage} /> : null}
          {tab === 'settings' ? <SettingsEditor onMessage={setMessage} /> : null}
          {tab === 'categories' ? <CategoryEditor onMessage={setMessage} /> : null}
          {tab === 'items' ? <ItemEditor onMessage={setMessage} /> : null}
          {tab === 'import' ? <ImportGuide /> : null}
          {tab === 'system' ? <SystemSettings /> : null}
        </section>
      </div>
    </main>
  );
}

function AdminNavButton({
  active,
  children,
  icon,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <button className={active ? 'active' : ''} onClick={onClick} type="button">
      {icon}<span>{children}</span>
    </button>
  );
}

function AdminLogin({ onMessage, message }: { onMessage: (value: string | null) => void; message: string | null }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  async function login(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    onMessage(error ? error.message : null);
  }

  return (
    <main className="admin-login">
      <form onSubmit={login}>
        <h1>后台登录</h1>
        <label>
          邮箱
          <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" />
        </label>
        <label>
          密码
          <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" />
        </label>
        {message ? <p className="error-text">{message}</p> : null}
        <button className="primary-button stretch" type="submit">
          登录
        </button>
      </form>
    </main>
  );
}

function Dashboard({
  onMessage,
  onOpenOrders,
}: {
  onMessage: (value: string | null) => void;
  onOpenOrders: () => void;
}) {
  const [orders, setOrders] = useState<Order[]>([]);

  useEffect(() => {
    load();
    return subscribeToAdminOrders(load);
  }, []);

  async function load() {
    try {
      setOrders(await fetchAdminOrders());
    } catch (err) {
      onMessage(err instanceof Error ? err.message : String(err));
    }
  }

  const todayOrders = useMemo(() => orders.filter((order) => isToday(order.created_at)), [orders]);
  const todayRevenue = todayOrders
    .filter((order) => order.status === 'paid')
    .reduce((sum, order) => sum + Number(order.total_price), 0);
  const pendingCount = orders.filter((order) => order.status === 'pending').length;
  const preparingCount = orders.filter((order) => order.status === 'preparing').length;

  const hotItems = useMemo(() => {
    const rows = new Map<string, { name: string; quantity: number; total: number }>();
    todayOrders
      .filter((order) => order.status !== 'cancelled')
      .forEach((order) => {
        (order.order_items ?? []).forEach((item) => {
          const name = item.item_name_zh || item.item_name_en || item.item_name_el || '未命名菜品';
          const current = rows.get(name) ?? { name, quantity: 0, total: 0 };
          current.quantity += Number(item.quantity);
          current.total += Number(item.line_total);
          rows.set(name, current);
        });
      });
    return Array.from(rows.values())
      .sort((a, b) => b.quantity - a.quantity || b.total - a.total)
      .slice(0, 8);
  }, [todayOrders]);

  return (
    <AdminSection title="经营概览" onRefresh={load}>
      <div className="dashboard-grid">
        <div className="summary-tile urgent">
          <span>今日订单数量</span>
          <strong>{todayOrders.length}</strong>
        </div>
        <div className="summary-tile">
          <span>今日营业额（已付款）</span>
          <strong>{formatPrice(todayRevenue)}</strong>
        </div>
        <div className="summary-tile">
          <span>待处理订单</span>
          <strong>{pendingCount}</strong>
        </div>
        <div className="summary-tile">
          <span>制作中订单</span>
          <strong>{preparingCount}</strong>
        </div>
      </div>

      <div className="admin-panel-card">
        <div className="section-title-row compact">
          <div>
            <h2>今日热销菜品</h2>
            <p>不统计已取消订单，按销量排序。</p>
          </div>
          <button className="secondary-button" type="button" onClick={onOpenOrders}>
            <ClipboardList size={16} />
            查看全部历史订单
          </button>
        </div>
        {hotItems.length === 0 ? (
          <div className="admin-empty-state">
            <BarChart3 size={28} />
            <strong>今天还没有可统计的菜品</strong>
            <span>收到订单后这里会自动更新。</span>
          </div>
        ) : (
          <div className="hot-item-list">
            {hotItems.map((item, index) => (
              <div key={item.name}>
                <span>{index + 1}</span>
                <strong>{item.name}</strong>
                <em>{item.quantity} 份</em>
                <b>{formatPrice(item.total)}</b>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminSection>
  );
}

function SettingsEditor({ onMessage }: { onMessage: (value: string | null) => void }) {
  const [settings, setSettings] = useState<Partial<RestaurantSettings>>(emptySettings);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    if (!supabase) return;
    const { data, error } = await supabase.from('restaurant_settings').select('*').limit(1).maybeSingle();
    if (error) onMessage(error.message);
    setSettings(data ?? emptySettings);
  }

  async function save() {
    if (!supabase) return;
    const payload = { ...emptySettings, ...settings };
    const { error } = settings.id
      ? await supabase.from('restaurant_settings').update(payload).eq('id', settings.id)
      : await supabase.from('restaurant_settings').insert(payload);
    onMessage(error ? error.message : '餐馆信息已保存');
    if (!error) load();
  }

  return (
    <AdminSection title="餐馆信息" onRefresh={load}>
      <div className="admin-language-panels">
        <section><h3>简体中文</h3><div className="admin-form-grid">
          <TextField label="餐馆名称" value={settings.name_zh} onChange={(v) => setSettings({ ...settings, name_zh: v })} />
          <TextField label="地址" value={settings.address_zh} onChange={(v) => setSettings({ ...settings, address_zh: v })} />
          <TextField label="营业时间" value={settings.opening_hours_zh} onChange={(v) => setSettings({ ...settings, opening_hours_zh: v })} />
        </div></section>
        <section><h3>English</h3><div className="admin-form-grid">
          <TextField label="Restaurant name" value={settings.name_en} onChange={(v) => setSettings({ ...settings, name_en: v })} />
          <TextField label="Address" value={settings.address_en} onChange={(v) => setSettings({ ...settings, address_en: v })} />
          <TextField label="Opening hours" value={settings.opening_hours_en} onChange={(v) => setSettings({ ...settings, opening_hours_en: v })} />
        </div></section>
        <section><h3>Ελληνικά</h3><div className="admin-form-grid">
          <TextField label="Όνομα" value={settings.name_el} onChange={(v) => setSettings({ ...settings, name_el: v })} />
          <TextField label="Διεύθυνση" value={settings.address_el} onChange={(v) => setSettings({ ...settings, address_el: v })} />
          <TextField label="Ωράριο" value={settings.opening_hours_el} onChange={(v) => setSettings({ ...settings, opening_hours_el: v })} />
        </div></section>
      </div>
      <div className="admin-form-panel">
        <h3>联系方式与平台</h3>
        <div className="admin-form-grid">
        <TextField label="电话" value={settings.phone} onChange={(v) => setSettings({ ...settings, phone: v })} />
        <TextField label="Google Maps 链接" value={settings.map_url} onChange={(v) => setSettings({ ...settings, map_url: v })} />
        <TextField label="Wolt 外卖链接" value={settings.wolt_url} onChange={(v) => setSettings({ ...settings, wolt_url: v })} />
        <TextField label="efood 外卖链接" value={settings.efood_url} onChange={(v) => setSettings({ ...settings, efood_url: v })} />
        <TextField label="Box 外卖链接" value={settings.box_url} onChange={(v) => setSettings({ ...settings, box_url: v })} />
        </div>
      </div>
      <button className="primary-button" type="button" onClick={save}>
        <Save size={16} />
        保存
      </button>
    </AdminSection>
  );
}

function CategoryEditor({ onMessage }: { onMessage: (value: string | null) => void }) {
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [draft, setDraft] = useState<Partial<MenuCategory>>(emptyCategory);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    if (!supabase) return;
    const { data, error } = await supabase
      .from('menu_categories')
      .select('*')
      .is('deleted_at', null)
      .order('sort_order');
    if (error) onMessage(error.message);
    setCategories((data ?? []) as MenuCategory[]);
  }

  async function saveCategory(category: Partial<MenuCategory>) {
    if (!supabase) return;
    const payload = {
      name_zh: category.name_zh ?? '',
      name_en: category.name_en ?? '',
      name_el: category.name_el ?? '',
      sort_order: Number(category.sort_order ?? 0),
      is_active: Boolean(category.is_active),
    };
    const { error } = category.id
      ? await supabase.from('menu_categories').update(payload).eq('id', category.id)
      : await supabase.from('menu_categories').insert(payload);
    onMessage(error ? error.message : '分类已保存');
    if (!error) {
      setDraft(emptyCategory);
      load();
    }
  }

  async function deleteCategory(category: MenuCategory) {
    if (!supabase) return;
    if (!window.confirm(`确定删除分类“${category.name_zh || category.name_en || category.name_el}”吗？删除后前台不会再显示。`)) return;

    const { count, error: countError } = await supabase
      .from('menu_items')
      .select('id', { count: 'exact', head: true })
      .eq('category_id', category.id)
      .is('deleted_at', null);
    if (countError) {
      onMessage(countError.message);
      return;
    }
    if ((count ?? 0) > 0) {
      onMessage(`该分类下还有 ${count} 个菜品，请先移动或删除菜品后再删除分类。`);
      return;
    }

    const { error } = await supabase
      .from('menu_categories')
      .update({ deleted_at: new Date().toISOString(), is_active: false })
      .eq('id', category.id);
    onMessage(error ? error.message : '分类已删除');
    if (!error) load();
  }

  return (
    <AdminSection title="菜单分类" onRefresh={load}>
      <div className="admin-table">
        {categories.map((category) => (
          <CategoryRow category={category} onSave={saveCategory} onDelete={deleteCategory} key={category.id} />
        ))}
      </div>
      <h3>新增分类</h3>
      <CategoryForm value={draft} onChange={setDraft} />
      <button className="primary-button" type="button" onClick={() => saveCategory(draft)}>
        <Plus size={16} />
        新增分类
      </button>
    </AdminSection>
  );
}

const menuCsvHeaders = [
  'category_zh',
  'category_en',
  'category_el',
  'name_zh',
  'name_en',
  'name_el',
  'description_zh',
  'description_en',
  'description_el',
  'price',
  'image_url',
  'is_available',
  'sort_order',
] as const;

type MenuCsvHeader = (typeof menuCsvHeaders)[number];
type MenuCsvRow = Record<MenuCsvHeader, string>;
type CsvImportResult = { success: number; failed: number; translationFailed: number; errors: string[] };
type MenuTranslationFields = Pick<
  Partial<MenuItem>,
  'name_zh' | 'description_zh' | 'name_en' | 'description_en' | 'name_el' | 'description_el'
>;

function buildMenuCsv(items: MenuItem[], categories: MenuCategory[]) {
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const rows = items.map((item) => {
    const category = item.category_id ? categoryById.get(item.category_id) : null;
    return {
      category_zh: category?.name_zh ?? '',
      category_en: category?.name_en ?? '',
      category_el: category?.name_el ?? '',
      name_zh: item.name_zh ?? '',
      name_en: item.name_en ?? '',
      name_el: item.name_el ?? '',
      description_zh: item.description_zh ?? '',
      description_en: item.description_en ?? '',
      description_el: item.description_el ?? '',
      price: String(item.price ?? ''),
      image_url: item.image_url ?? '',
      is_available: String(Boolean(item.is_available)),
      sort_order: String(item.sort_order ?? 0),
    } satisfies MenuCsvRow;
  });
  return [menuCsvHeaders.join(','), ...rows.map((row) => menuCsvHeaders.map((header) => escapeCsv(row[header])).join(','))].join('\n');
}

function parseMenuCsv(csvText: string): MenuCsvRow[] {
  const rows = parseCsvRows(csvText.replace(/^\uFEFF/, ''));
  if (rows.length === 0) return [];
  const headers = rows[0].map((header) => header.trim());
  const missing = menuCsvHeaders.filter((header) => !headers.includes(header));
  if (missing.length > 0) throw new Error(`CSV 缺少字段：${missing.join(', ')}`);
  return rows
    .slice(1)
    .filter((row) => row.some((cell) => cell.trim()))
    .map((row) => {
      const next = Object.fromEntries(menuCsvHeaders.map((header) => [header, ''])) as MenuCsvRow;
      headers.forEach((header, index) => {
        if (menuCsvHeaders.includes(header as MenuCsvHeader)) next[header as MenuCsvHeader] = row[index]?.trim() ?? '';
      });
      return next;
    });
}

function parseCsvRows(input: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(cell);
      cell = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }

  row.push(cell);
  rows.push(row);
  return rows;
}

function escapeCsv(value: string) {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function parseBoolean(value: string) {
  const normalized = value.trim().toLowerCase();
  return !['false', '0', 'no', 'n', '下架', '否'].includes(normalized);
}

function normalized(value?: string | null) {
  return (value ?? '').trim().toLowerCase();
}

function findMatchingCategory(categories: MenuCategory[], row: MenuCsvRow) {
  return categories.find(
    (category) =>
      sameNonEmpty(category.name_zh, row.category_zh) ||
      sameNonEmpty(category.name_en, row.category_en) ||
      sameNonEmpty(category.name_el, row.category_el),
  );
}

function findMatchingItem(items: MenuItem[], row: MenuCsvRow, categoryId: string) {
  return items.find(
    (item) =>
      item.category_id === categoryId &&
      (sameNonEmpty(item.name_zh, row.name_zh) ||
        sameNonEmpty(item.name_en, row.name_en) ||
        sameNonEmpty(item.name_el, row.name_el)),
  );
}

function sameNonEmpty(left?: string | null, right?: string | null) {
  const a = normalized(left);
  const b = normalized(right);
  return Boolean(a && b && a === b);
}

function needsMenuTranslation(value: MenuTranslationFields) {
  return Boolean(
    (value.name_zh || value.description_zh) &&
      (!value.name_en || !value.description_en || !value.name_el || !value.description_el),
  );
}

function mergeMissingTranslations<T extends MenuTranslationFields>(value: T, translation: MenuTranslationFields): T {
  return {
    ...value,
    name_en: value.name_en || translation.name_en || '',
    description_en: value.description_en || translation.description_en || '',
    name_el: value.name_el || translation.name_el || '',
    description_el: value.description_el || translation.description_el || '',
  };
}

async function requestMenuTranslations(items: MenuTranslationFields[]) {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('请先登录后台');

  const response = await fetch('/api/admin/translate-menu-item', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ items }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || '自动翻译失败');
  return (payload.translations ?? []) as MenuTranslationFields[];
}

async function translateSingleMenuValue<T extends MenuTranslationFields>(value: T) {
  if (!needsMenuTranslation(value)) return value;
  const [translation] = await requestMenuTranslations([value]);
  return mergeMissingTranslations(value, translation ?? {});
}

function ItemEditor({ onMessage }: { onMessage: (value: string | null) => void }) {
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [draft, setDraft] = useState<Partial<MenuItem>>(emptyItem);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkPrice, setBulkPrice] = useState('');
  const [csvPreview, setCsvPreview] = useState<MenuCsvRow[]>([]);
  const [csvResult, setCsvResult] = useState<CsvImportResult | null>(null);
  const [translatingDraft, setTranslatingDraft] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    if (!supabase) return;
    const [catResult, itemResult] = await Promise.all([
      supabase.from('menu_categories').select('*').is('deleted_at', null).order('sort_order'),
      supabase.from('menu_items').select('*').is('deleted_at', null).order('sort_order'),
    ]);
    if (catResult.error) onMessage(catResult.error.message);
    if (itemResult.error) onMessage(itemResult.error.message);
    setCategories((catResult.data ?? []) as MenuCategory[]);
    setItems((itemResult.data ?? []) as MenuItem[]);
  }

  const filteredItems = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    return items.filter((item) => {
      const categoryMatches = categoryFilter === 'all' || item.category_id === categoryFilter;
      const keywordMatches =
        !keyword ||
        [item.name_zh, item.name_en, item.name_el]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(keyword));
      return categoryMatches && keywordMatches;
    });
  }, [items, categoryFilter, searchTerm]);

  const selectedItems = useMemo(
    () => items.filter((item) => selectedIds.has(item.id)),
    [items, selectedIds],
  );

  function toggleSelect(itemId: string, checked: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) next.add(itemId);
      else next.delete(itemId);
      return next;
    });
  }

  function toggleSelectVisible(checked: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      filteredItems.forEach((item) => {
        if (checked) next.add(item.id);
        else next.delete(item.id);
      });
      return next;
    });
  }

  async function bulkUpdateAvailability(isAvailable: boolean) {
    if (!supabase || selectedIds.size === 0) return;
    const { error } = await supabase.from('menu_items').update({ is_available: isAvailable }).in('id', Array.from(selectedIds));
    onMessage(error ? error.message : `已批量${isAvailable ? '上架' : '下架'} ${selectedIds.size} 个菜品`);
    if (!error) {
      setSelectedIds(new Set());
      load();
    }
  }

  async function deleteItems(ids: string[], label: string) {
    if (!supabase || ids.length === 0) return;
    const confirmed = window.confirm(
      `${label}将从前台菜单隐藏，并保留历史订单快照。确定继续吗？`,
    );
    if (!confirmed) return;

    const { error } = await supabase
      .from('menu_items')
      .update({ deleted_at: new Date().toISOString(), is_available: false })
      .in('id', ids);
    onMessage(error ? error.message : `已删除 ${ids.length} 个菜品`);
    if (!error) {
      setSelectedIds(new Set());
      load();
    }
  }

  async function bulkUpdatePrice() {
    if (!supabase || selectedIds.size === 0) return;
    const nextPrice = Number(bulkPrice);
    if (!Number.isFinite(nextPrice) || nextPrice < 0) {
      onMessage('请输入正确的价格');
      return;
    }
    const { error } = await supabase.from('menu_items').update({ price: nextPrice }).in('id', Array.from(selectedIds));
    onMessage(error ? error.message : `已批量修改 ${selectedIds.size} 个菜品价格`);
    if (!error) {
      setBulkPrice('');
      setSelectedIds(new Set());
      load();
    }
  }

  function exportCsv() {
    const csv = buildMenuCsv(items, categories);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `wok-dragon-menu-${dateToKey(new Date().toISOString())}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function previewCsv(file: File | null) {
    setCsvResult(null);
    if (!file) return;
    try {
      setCsvPreview(parseMenuCsv(await file.text()));
    } catch (err) {
      setCsvPreview([]);
      onMessage(err instanceof Error ? err.message : String(err));
    }
  }

  async function translateCsvRows(rows: MenuCsvRow[], result: CsvImportResult) {
    const translatedRows = [...rows];
    const targets = rows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => needsMenuTranslation(row));

    for (let start = 0; start < targets.length; start += 4) {
      const chunk = targets.slice(start, start + 4);
      try {
        const translations = await requestMenuTranslations(chunk.map(({ row }) => row));
        chunk.forEach(({ row, index }, chunkIndex) => {
          translatedRows[index] = mergeMissingTranslations(row, translations[chunkIndex] ?? {});
        });
      } catch (err) {
        result.translationFailed += chunk.length;
        chunk.forEach(({ index }) => {
          result.errors.push(`第 ${index + 2} 行翻译失败：${err instanceof Error ? err.message : String(err)}`);
        });
      }
    }

    return translatedRows;
  }

  async function importCsv() {
    if (!supabase || csvPreview.length === 0) return;
    const result: CsvImportResult = { success: 0, failed: 0, translationFailed: 0, errors: [] };
    const categoryRows = [...categories];
    const itemRows = [...items];
    const rowsToImport = await translateCsvRows(csvPreview, result);

    for (const [index, row] of rowsToImport.entries()) {
      try {
        const price = Number(row.price);
        if (!row.name_zh && !row.name_en && !row.name_el) throw new Error('菜品名称不能为空');
        if (!row.category_zh && !row.category_en && !row.category_el) throw new Error('分类名称不能为空');
        if (!Number.isFinite(price) || price < 0) throw new Error('价格不正确');

        let category = findMatchingCategory(categoryRows, row);
        if (!category) {
          const { data, error } = await supabase
            .from('menu_categories')
            .insert({
              name_zh: row.category_zh,
              name_en: row.category_en || null,
              name_el: row.category_el || null,
              sort_order: categoryRows.length + 1,
              is_active: true,
            })
            .select('*')
            .single();
          if (error) throw error;
          category = data as MenuCategory;
          categoryRows.push(category);
        }

        const payload = {
          category_id: category.id,
          name_zh: row.name_zh,
          name_en: row.name_en || null,
          name_el: row.name_el || null,
          description_zh: row.description_zh || null,
          description_en: row.description_en || null,
          description_el: row.description_el || null,
          price,
          image_url: row.image_url || null,
          is_available: parseBoolean(row.is_available),
          sort_order: Number(row.sort_order || 0),
        };
        const existing = findMatchingItem(itemRows, row, category.id);
        const { data, error } = existing
          ? await supabase.from('menu_items').update(payload).eq('id', existing.id).select('*').single()
          : await supabase.from('menu_items').insert(payload).select('*').single();
        if (error) throw error;
        if (data) {
          const nextItem = data as MenuItem;
          const position = itemRows.findIndex((item) => item.id === nextItem.id);
          if (position >= 0) itemRows[position] = nextItem;
          else itemRows.push(nextItem);
        }
        result.success += 1;
      } catch (err) {
        result.failed += 1;
        result.errors.push(`第 ${index + 2} 行：${err instanceof Error ? err.message : String(err)}`);
      }
    }

    setCsvResult(result);
    onMessage(`导入完成：成功 ${result.success} 条，失败 ${result.failed} 条，翻译失败 ${result.translationFailed} 条`);
    load();
  }

  async function saveItem(item: Partial<MenuItem>) {
    if (!supabase) return;
    const payload = {
      category_id: item.category_id || null,
      name_zh: item.name_zh ?? '',
      name_en: item.name_en ?? '',
      name_el: item.name_el ?? '',
      description_zh: item.description_zh ?? '',
      description_en: item.description_en ?? '',
      description_el: item.description_el ?? '',
      price: Number(item.price ?? 0),
      image_url: item.image_url || null,
      is_available: Boolean(item.is_available),
      sort_order: Number(item.sort_order ?? 0),
    };
    const { error } = item.id
      ? await supabase.from('menu_items').update(payload).eq('id', item.id)
      : await supabase.from('menu_items').insert(payload);
    onMessage(error ? error.message : '菜品已保存');
    if (!error) {
      setDraft(emptyItem);
      load();
    }
  }

  async function duplicateItem(item: MenuItem) {
    const copy: Partial<MenuItem> = { ...item };
    delete copy.id;
    await saveItem({
      ...copy,
      name_zh: `${item.name_zh} 副本`,
      name_en: item.name_en ? `${item.name_en} copy` : item.name_en,
      sort_order: item.sort_order + 1,
    });
  }

  async function autoTranslateDraft() {
    try {
      setTranslatingDraft(true);
      setDraft(await translateSingleMenuValue(draft));
      onMessage('自动翻译已补全缺失字段');
    } catch (err) {
      onMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setTranslatingDraft(false);
    }
  }

  return (
    <AdminSection title="菜品管理" onRefresh={load}>
      <div className="menu-management-tools">
        <label>
          按分类筛选
          <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
            <option value="all">全部分类</option>
            {categories.map((category) => (
              <option value={category.id} key={category.id}>
                {category.name_zh || category.name_en || category.name_el}
              </option>
            ))}
          </select>
        </label>
        <label>
          搜索菜名
          <span className="search-input-wrap">
            <Search size={16} />
            <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="中文 / English / Ελληνικά" />
          </span>
        </label>
        <button className="secondary-button" type="button" onClick={exportCsv}>
          <Download size={16} />
          导出 CSV
        </button>
      </div>

      <div className="bulk-action-bar">
        <label className="checkbox-label">
          <input
            checked={filteredItems.length > 0 && filteredItems.every((item) => selectedIds.has(item.id))}
            type="checkbox"
            onChange={(event) => toggleSelectVisible(event.target.checked)}
          />
          选择当前筛选结果
        </label>
        <strong>已选择 {selectedItems.length} 个菜品</strong>
        <input value={bulkPrice} type="number" min="0" step="0.01" placeholder="新价格" onChange={(event) => setBulkPrice(event.target.value)} />
        <button className="secondary-button" type="button" disabled={selectedIds.size === 0} onClick={bulkUpdatePrice}>
          批量改价
        </button>
        <button className="secondary-button" type="button" disabled={selectedIds.size === 0} onClick={() => bulkUpdateAvailability(true)}>
          批量上架
        </button>
        <button className="secondary-button" type="button" disabled={selectedIds.size === 0} onClick={() => bulkUpdateAvailability(false)}>
          批量下架
        </button>
        <button className="danger-inline" type="button" disabled={selectedIds.size === 0} onClick={() => deleteItems(Array.from(selectedIds), `批量删除 ${selectedIds.size} 个菜品`)}>
          <Trash2 size={15} />
          批量删除
        </button>
      </div>

      <div className="csv-import-panel">
        <label>
          CSV 导入预览
          <input accept=".csv,text/csv" type="file" onChange={(event) => previewCsv(event.target.files?.[0] ?? null)} />
        </label>
        <button className="secondary-button" type="button" disabled={csvPreview.length === 0} onClick={importCsv}>
          <Upload size={16} />
          确认导入
        </button>
        <span>预览 {csvPreview.length} 条</span>
        {csvResult ? (
          <strong>
            成功 {csvResult.success} 条，失败 {csvResult.failed} 条，翻译失败 {csvResult.translationFailed} 条
          </strong>
        ) : null}
      </div>
      {csvResult?.errors.length ? (
        <div className="csv-error-box">
          {csvResult.errors.slice(0, 8).map((error) => (
            <p key={error}>{error}</p>
          ))}
        </div>
      ) : null}
      {csvPreview.length > 0 ? (
        <div className="csv-preview-table">
          {csvPreview.slice(0, 8).map((row, index) => (
            <div key={`${row.name_zh}-${index}`}>
              <strong>{row.name_zh || row.name_en || row.name_el}</strong>
              <span>{row.category_zh || row.category_en || row.category_el}</span>
              <b>{row.price}</b>
            </div>
          ))}
        </div>
      ) : null}

      <div className="admin-table item-table">
        <div className="item-table-head" aria-hidden="true">
          <span>选择</span><span>菜品</span><span>分类</span><span>价格</span><span>状态</span><span>操作</span>
        </div>
        {filteredItems.map((item) => (
          <ItemRow
            item={item}
            categories={categories}
            selected={selectedIds.has(item.id)}
            onSelect={(checked) => toggleSelect(item.id, checked)}
            onMessage={onMessage}
            onSave={saveItem}
            onDuplicate={duplicateItem}
            onDelete={(target) => deleteItems([target.id], `删除菜品“${target.name_zh || target.name_en || target.name_el}”`)}
            key={item.id}
          />
        ))}
      </div>
      <h3>新增菜品</h3>
      <ItemForm value={draft} categories={categories} onChange={setDraft} />
      <button className="secondary-button" type="button" disabled={translatingDraft} onClick={autoTranslateDraft}>
        {translatingDraft ? '正在翻译...' : '自动翻译'}
      </button>
      <button className="primary-button" type="button" onClick={() => saveItem(draft)}>
        <Plus size={16} />
        新增菜品
      </button>
    </AdminSection>
  );
}

function OrderManager({ onMessage }: { onMessage: (value: string | null) => void }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [billRequests, setBillRequests] = useState<BillRequest[]>([]);
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all');
  const [tableFilter, setTableFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState<'today' | 'all' | 'custom'>('today');
  const [customDate, setCustomDate] = useState(dateToKey(new Date().toISOString()));
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [autoPrintEnabled, setAutoPrintEnabled] = useState(false);
  const [newOrderIds, setNewOrderIds] = useState<Set<string>>(new Set());
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
  const knownOrderIdsRef = useRef<Set<string>>(new Set());
  const knownBillRequestIdsRef = useRef<Set<string>>(new Set());
  const soundEnabledRef = useRef(false);
  const autoPrintEnabledRef = useRef(false);
  const autoPrintWindowRef = useRef<Window | null>(null);
  const autoPrintQueueRef = useRef<Promise<void>>(Promise.resolve());
  const autoPrintingOrderIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    load({ initial: true });
    const unsubscribe = subscribeToAdminOrders(() => load());
    return () => {
      unsubscribe();
      autoPrintEnabledRef.current = false;
      if (autoPrintWindowRef.current && !autoPrintWindowRef.current.closed) {
        autoPrintWindowRef.current.close();
      }
    };
  }, []);

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  async function load(options?: { initial?: boolean }) {
    try {
      const [nextOrders, nextBillRequests] = await Promise.all([
        fetchAdminOrders(),
        fetchPendingBillRequests(),
      ]);
      const previousIds = knownOrderIdsRef.current;
      const previousBillIds = knownBillRequestIdsRef.current;
      const insertedPendingOrders = options?.initial
        ? []
        : nextOrders.filter((order) => !previousIds.has(order.id) && order.status === 'pending');

      knownOrderIdsRef.current = new Set(nextOrders.map((order) => order.id));
      knownBillRequestIdsRef.current = new Set(nextBillRequests.map((request) => request.id));
      setOrders(nextOrders);
      setBillRequests(nextBillRequests);

      const hasNewBillRequest = !options?.initial && nextBillRequests.some((request) => !previousBillIds.has(request.id));
      if (insertedPendingOrders.length > 0 || hasNewBillRequest) {
        setNewOrderIds((current) => {
          const next = new Set(current);
          insertedPendingOrders.forEach((order) => next.add(order.id));
          return next;
        });
        if (soundEnabledRef.current) playOrderNotification();
      }
      if (autoPrintEnabledRef.current) {
        queueAutoPrint(insertedPendingOrders.filter((order) => !order.kitchen_printed_at));
      }
    } catch (err) {
      onMessage(err instanceof Error ? err.message : String(err));
    }
  }

  async function changeStatus(orderId: string, status: OrderStatus) {
    try {
      await updateOrderStatus(orderId, status);
      onMessage('订单状态已更新');
      load();
    } catch (err) {
      onMessage(err instanceof Error ? err.message : String(err));
    }
  }

  async function confirmBillPayment(request: BillRequest) {
    try {
      const result = await confirmBillAndCloseSession(request.session_id);
      onMessage(`已付款并清桌：${result.paid_order_count} 张订单已结清，${result.deleted_cart_count} 条未提交购物车已清空`);
      load();
    } catch (err) {
      onMessage(formatUnknownError(err));
    }
  }

  async function printKitchenTicket(order: Order) {
    const printWindow = window.open('', '_blank', 'width=420,height=720');
    if (!printWindow) {
      onMessage('浏览器阻止了打印窗口，请允许此网站打开弹窗后重试');
      return;
    }

    printWindow.document.write('<p style="font-family:sans-serif;padding:20px">正在准备厨房小票...</p>');
    try {
      const result = await markOrderKitchenPrinted(order.id);
      await renderAndPrintKitchenTicket(printWindow, buildKitchenTicket(order, result.is_reprint, result.printed_at));
      onMessage(result.is_reprint ? `订单 #${order.order_number} 已打开重打小票` : `订单 #${order.order_number} 已打开厨房小票`);
      load();
    } catch (err) {
      printWindow.close();
      onMessage(formatUnknownError(err));
    }
  }

  function toggleAutoPrint() {
    if (autoPrintEnabledRef.current) {
      autoPrintEnabledRef.current = false;
      setAutoPrintEnabled(false);
      if (autoPrintWindowRef.current && !autoPrintWindowRef.current.closed) {
        autoPrintWindowRef.current.close();
      }
      autoPrintWindowRef.current = null;
      onMessage('自动打印厨房小票已关闭');
      return;
    }

    const printWindow = window.open('', 'wok-dragon-kitchen-printer', 'width=420,height=720');
    if (!printWindow) {
      onMessage('浏览器阻止了自动打印窗口，请允许此网站打开弹窗后重新启用');
      return;
    }

    printWindow.document.open();
    printWindow.document.write(buildPrinterReadyScreen());
    printWindow.document.close();
    autoPrintWindowRef.current = printWindow;
    autoPrintEnabledRef.current = true;
    setAutoPrintEnabled(true);
    onMessage('自动打印厨房小票已启用，仅处理之后收到的新订单');
  }

  function queueAutoPrint(pendingOrders: Order[]) {
    pendingOrders.forEach((order) => {
      if (autoPrintingOrderIdsRef.current.has(order.id)) return;
      autoPrintingOrderIdsRef.current.add(order.id);
      autoPrintQueueRef.current = autoPrintQueueRef.current
        .then(() => autoPrintKitchenTicket(order))
        .catch((err) => onMessage(`订单 #${order.order_number} 自动打印失败：${formatUnknownError(err)}`))
        .finally(() => autoPrintingOrderIdsRef.current.delete(order.id));
    });
  }

  async function autoPrintKitchenTicket(order: Order) {
    if (!autoPrintEnabledRef.current || order.kitchen_printed_at) return;
    const printWindow = autoPrintWindowRef.current;
    if (!printWindow || printWindow.closed) {
      autoPrintEnabledRef.current = false;
      setAutoPrintEnabled(false);
      autoPrintWindowRef.current = null;
      onMessage('自动打印窗口已关闭，请重新启用自动打印厨房小票');
      return;
    }

    const result = await markOrderKitchenPrinted(order.id);
    if (result.is_reprint) return;

    await renderAndPrintKitchenTicket(printWindow, buildKitchenTicket(order, false, result.printed_at));
    onMessage(`新订单 #${order.order_number} 已触发自动打印厨房小票`);
    load();
  }

  function toggleOrderSelection(orderId: string, checked: boolean) {
    setSelectedOrderIds((current) => {
      const next = new Set(current);
      if (checked) next.add(orderId);
      else next.delete(orderId);
      return next;
    });
  }

  function toggleVisibleOrders(checked: boolean) {
    setSelectedOrderIds((current) => {
      const next = new Set(current);
      filteredOrders.forEach((order) => {
        if (checked) next.add(order.id);
        else next.delete(order.id);
      });
      return next;
    });
  }

  async function deleteOrders(ids: string[], label: string) {
    if (!supabase || ids.length === 0) return;
    const confirmed = window.confirm(`${label}会从后台订单列表隐藏，订单明细历史快照仍会保留。确定继续吗？`);
    if (!confirmed) return;
    const { error } = await supabase
      .from('orders')
      .update({ deleted_at: new Date().toISOString(), status: 'cancelled' })
      .in('id', ids);
    onMessage(error ? error.message : `已删除 ${ids.length} 张订单`);
    if (!error) {
      setSelectedOrderIds(new Set());
      load();
    }
  }

  const scopedOrders = useMemo(
    () =>
      orders.filter((order) => {
        const tableMatches = tableFilter === 'all' || order.restaurant_tables?.table_number === Number(tableFilter);
        const dateMatches =
          dateFilter === 'all' ||
          (dateFilter === 'today' && isToday(order.created_at)) ||
          (dateFilter === 'custom' && dateToKey(order.created_at) === customDate);
        return tableMatches && dateMatches;
      }),
    [orders, tableFilter, dateFilter, customDate],
  );

  const statusCounts = useMemo(() => {
    const counts: Record<OrderStatus, number> = {
      pending: 0,
      preparing: 0,
      served: 0,
      paid: 0,
      cancelled: 0,
    };
    for (const order of scopedOrders) {
      counts[order.status] += 1;
    }
    return counts;
  }, [scopedOrders]);

  const filteredOrders = useMemo(
    () => scopedOrders.filter((order) => statusFilter === 'all' || order.status === statusFilter),
    [scopedOrders, statusFilter],
  );

  const tableOptions = useMemo(() => {
    const values = new Set<number>();
    orders.forEach((order) => {
      if (order.restaurant_tables?.table_number) values.add(order.restaurant_tables.table_number);
    });
    return Array.from(values).sort((a, b) => a - b);
  }, [orders]);

  const activeOrders = statusCounts.pending + statusCounts.preparing + statusCounts.served;
  const paidTotal = scopedOrders
    .filter((order) => order.status === 'paid')
    .reduce((sum, order) => sum + Number(order.total_price), 0);

  return (
    <AdminSection title="订单管理" onRefresh={load}>
      {billRequests.length ? (
        <section className="bill-request-alerts" aria-label="请求结账">
          <div className="bill-request-alerts-head">
            <strong>请求结账</strong>
            <span>{billRequests.length} 桌</span>
          </div>
          <div className="bill-request-list">
            {billRequests.map((request) => (
              <article key={request.id}>
                <div>
                  {request.payment_method === 'pos' ? <CreditCard size={20} /> : <Banknote size={20} />}
                  <span>
                    <strong>{request.table_number} 号桌请求结账</strong>
                    <small>{request.payment_method === 'pos' ? 'POS 机支付' : '现金支付'} · 请求时间 {new Date(request.requested_at).toLocaleString('zh-CN')}</small>
                  </span>
                </div>
                <button className="primary-button" type="button" onClick={() => confirmBillPayment(request)}>
                  <CheckCircle2 size={16} />
                  确认已收款并清桌
                </button>
              </article>
            ))}
          </div>
          <p>该桌结账后将关闭当前点餐会话，下一批顾客扫码会进入新会话。</p>
        </section>
      ) : null}
      <div className="order-tools-row">
        <label className={autoPrintEnabled ? 'auto-print-toggle enabled' : 'auto-print-toggle'}>
          <input checked={autoPrintEnabled} type="checkbox" onChange={toggleAutoPrint} />
          <span>
            <strong>启用自动打印厨房小票</strong>
            <small>仅打印 Realtime 收到且尚未打印的新 pending 订单</small>
          </span>
        </label>
        <button
          className={soundEnabled ? 'sound-toggle enabled' : 'sound-toggle'}
          type="button"
          onClick={() => {
            setSoundEnabled(true);
            playOrderNotification();
            onMessage('声音提醒已启用');
          }}
        >
          {soundEnabled ? '声音提醒已启用' : '启用声音提醒'}
        </button>
        <label>
          日期
          <select value={dateFilter} onChange={(event) => setDateFilter(event.target.value as 'today' | 'all' | 'custom')}>
            <option value="today">今日订单</option>
            <option value="all">全部日期</option>
            <option value="custom">指定日期</option>
          </select>
        </label>
        {dateFilter === 'custom' ? (
          <label>
            选择日期
            <input value={customDate} type="date" onChange={(event) => setCustomDate(event.target.value)} />
          </label>
        ) : null}
        <label>
          桌号筛选
          <select value={tableFilter} onChange={(event) => setTableFilter(event.target.value)}>
            <option value="all">全部桌号</option>
            {tableOptions.map((tableNumber) => (
              <option value={tableNumber} key={tableNumber}>
                {tableNumber} 号桌
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="order-summary-grid">
        <div className="summary-tile urgent">
          <span>待处理</span>
          <strong>{statusCounts.pending}</strong>
        </div>
        <div className="summary-tile">
          <span>进行中</span>
          <strong>{activeOrders}</strong>
        </div>
        <div className="summary-tile">
          <span>已付款金额</span>
          <strong>{formatPrice(paidTotal)}</strong>
        </div>
      </div>

      <div className="status-filter-bar" aria-label="订单状态筛选">
        <button
          className={statusFilter === 'all' ? 'selected' : ''}
          type="button"
          onClick={() => setStatusFilter('all')}
        >
          <ClipboardList size={16} />
          全部 {orders.length}
        </button>
        {(Object.keys(statusLabels) as OrderStatus[]).map((status) => (
          <button
            className={statusFilter === status ? 'selected' : ''}
            type="button"
            onClick={() => setStatusFilter(status)}
            key={status}
          >
            {statusIcons[status]}
            {statusLabels[status]} {statusCounts[status]}
          </button>
        ))}
      </div>

      <div className="bulk-action-bar">
        <label className="checkbox-label">
          <input
            checked={filteredOrders.length > 0 && filteredOrders.every((order) => selectedOrderIds.has(order.id))}
            type="checkbox"
            onChange={(event) => toggleVisibleOrders(event.target.checked)}
          />
          选择当前筛选订单
        </label>
        <strong>已选择 {selectedOrderIds.size} 张订单</strong>
        <button
          className="danger-inline"
          type="button"
          disabled={selectedOrderIds.size === 0}
          onClick={() => deleteOrders(Array.from(selectedOrderIds), `批量删除 ${selectedOrderIds.size} 张订单`)}
        >
          <Trash2 size={15} />
          批量删除订单
        </button>
      </div>

      <div className="order-admin-list">
        {filteredOrders.length === 0 ? (
          <div className="admin-empty-state">
            <ClipboardList size={28} />
            <strong>当前没有这个状态的订单</strong>
            <span>新订单会自动刷新显示在这里。</span>
          </div>
        ) : null}
        {filteredOrders.map((order) => (
          <article className={`admin-order status-${order.status} ${newOrderIds.has(order.id) ? 'is-new' : ''}`} key={order.id}>
            <div className="admin-order-head">
              <div>
                <label className="checkbox-label order-select">
                  <input
                    checked={selectedOrderIds.has(order.id)}
                    type="checkbox"
                    onChange={(event) => toggleOrderSelection(order.id, event.target.checked)}
                  />
                  选择订单
                </label>
                <span className="order-status-badge">
                  {statusIcons[order.status]}
                  {statusLabels[order.status]}
                </span>
                {newOrderIds.has(order.id) ? <span className="new-order-badge">新订单</span> : null}
                <h3>
                  {order.restaurant_tables?.table_number
                    ? `${order.restaurant_tables.table_number} 号桌`
                    : '未知桌台'}
                </h3>
                <p>
                  订单 #{order.order_number} · {new Date(order.created_at).toLocaleString('zh-CN')}
                </p>
              </div>
              <strong className="order-total">{formatPrice(Number(order.total_price))}</strong>
            </div>
            <div className="admin-order-items">
              {(order.order_items ?? []).map((item) => (
                <div key={item.id}>
                  <span className="order-item-name">
                    <b>×{item.quantity}</b>
                    {item.item_name_zh || item.item_name_en || item.item_name_el}
                  </span>
                  <span className="order-item-note">{item.note ? `备注：${item.note}` : ''}</span>
                  <strong>{formatPrice(Number(item.line_total))}</strong>
                </div>
              ))}
            </div>
            <footer className="order-action-row">
              <button type="button" onClick={() => printKitchenTicket(order)}>
                <Printer size={15} />
                {order.kitchen_printed_at ? '重新打印厨房小票' : '打印厨房小票'}
              </button>
              {(Object.keys(statusLabels) as OrderStatus[]).map((status) => (
                <button
                  className={order.status === status ? 'selected' : ''}
                  disabled={order.status === status}
                  key={status}
                  onClick={() => changeStatus(order.id, status)}
                  type="button"
                >
                  {statusIcons[status]}
                  {statusLabels[status]}
                </button>
              ))}
              <button className="danger-inline" type="button" onClick={() => deleteOrders([order.id], `删除订单 #${order.order_number}`)}>
                <Trash2 size={15} />
                删除订单
              </button>
            </footer>
          </article>
        ))}
      </div>
    </AdminSection>
  );
}

function escapeTicketText(value: string | number | null | undefined) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatUnknownError(value: unknown) {
  if (value instanceof Error) return value.message;
  if (value && typeof value === 'object' && 'message' in value) return String(value.message);
  return String(value);
}

function buildKitchenTicket(order: Order, isReprint: boolean, printedAt: string) {
  const tableNumber = order.restaurant_tables?.table_number ?? '?';
  const itemRows = (order.order_items ?? [])
    .map(
      (item) => `
        <div class="item">
          <strong>${escapeTicketText(item.quantity)} × ${escapeTicketText(item.item_name_zh || item.item_name_en || item.item_name_el)}</strong>
          ${item.note ? `<small>备注：${escapeTicketText(item.note)}</small>` : ''}
        </div>`,
    )
    .join('');

  return `<!doctype html>
    <html lang="zh-CN">
      <head>
        <meta charset="utf-8" />
        <title>厨房小票 #${escapeTicketText(order.order_number)}</title>
        <style>
          @page { size: 80mm auto; margin: 5mm; }
          body { color: #000; font-family: Arial, "Microsoft YaHei", sans-serif; margin: 0; width: 70mm; }
          h1 { border-bottom: 2px dashed #000; font-size: 24px; margin: 0 0 8px; padding-bottom: 8px; text-align: center; }
          .reprint { border: 3px solid #000; font-size: 20px; font-weight: 900; margin-bottom: 8px; padding: 5px; text-align: center; }
          .meta { border-bottom: 1px dashed #000; display: grid; gap: 4px; padding-bottom: 8px; }
          .item { border-bottom: 1px dashed #777; display: grid; font-size: 18px; gap: 4px; padding: 10px 0; }
          .item small { font-size: 15px; }
          footer { font-size: 11px; margin-top: 12px; text-align: center; }
        </style>
      </head>
      <body>
        ${isReprint ? '<div class="reprint">重打 / Reprint</div>' : ''}
        <h1>${escapeTicketText(tableNumber)} 号桌</h1>
        <div class="meta">
          <strong>订单 #${escapeTicketText(order.order_number)}</strong>
          <span>下单：${escapeTicketText(new Date(order.created_at).toLocaleString('zh-CN'))}</span>
          <span>打印：${escapeTicketText(new Date(printedAt).toLocaleString('zh-CN'))}</span>
        </div>
        ${itemRows}
        <footer>厨房点菜单 · 非正式税务收据</footer>
      </body>
    </html>`;
}

function buildPrinterReadyScreen() {
  return `<!doctype html>
    <html lang="zh-CN">
      <head><meta charset="utf-8" /><title>厨房小票自动打印</title></head>
      <body style="font-family:Arial,'Microsoft YaHei',sans-serif;padding:24px;text-align:center">
        <h1 style="font-size:20px">自动打印已启用</h1>
        <p>请保持此窗口打开。收到新的 pending 订单后，将自动显示浏览器打印确认窗口。</p>
        <small>厨房点菜单，不是正式税务收据。</small>
      </body>
    </html>`;
}

async function renderAndPrintKitchenTicket(printWindow: Window, ticketHtml: string) {
  printWindow.document.open();
  printWindow.document.write(ticketHtml);
  printWindow.document.close();
  printWindow.focus();
  await new Promise((resolve) => window.setTimeout(resolve, 180));
  printWindow.print();
  await new Promise((resolve) => window.setTimeout(resolve, 150));
}

function isToday(value: string) {
  const date = new Date(value);
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

function dateToKey(value: string) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function playOrderNotification() {
  const AudioContextClass =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return;
  const audioContext = new AudioContextClass();
  const gain = audioContext.createGain();
  gain.gain.setValueAtTime(0.001, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.25, audioContext.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.32);
  gain.connect(audioContext.destination);

  const playTone = (frequency: number, start: number, duration: number) => {
    const oscillator = audioContext.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime + start);
    oscillator.connect(gain);
    oscillator.start(audioContext.currentTime + start);
    oscillator.stop(audioContext.currentTime + start + duration);
  };

  playTone(880, 0, 0.12);
  playTone(1175, 0.16, 0.16);
  window.setTimeout(() => audioContext.close(), 650);
}

function TableManager({ onMessage }: { onMessage: (value: string | null) => void }) {
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [sessions, setSessions] = useState<TableSession[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [newNumber, setNewNumber] = useState(1);
  const [newLabel, setNewLabel] = useState('');

  useEffect(() => {
    load();
    return subscribeToAdminOrders(load);
  }, []);

  async function load() {
    try {
      const [tableRows, sessionRows, orderRows] = await Promise.all([
        fetchRestaurantTables(),
        fetchActiveSessions(),
        fetchAdminOrders(),
      ]);
      setTables(tableRows);
      setSessions(sessionRows);
      setOrders(orderRows);
    } catch (err) {
      onMessage(err instanceof Error ? err.message : String(err));
    }
  }

  async function addTable() {
    try {
      await createRestaurantTable(newNumber, newLabel || `Table ${newNumber}`);
      onMessage('桌台已创建');
      setNewNumber(newNumber + 1);
      setNewLabel('');
      load();
    } catch (err) {
      onMessage(err instanceof Error ? err.message : String(err));
    }
  }

  async function saveTable(table: RestaurantTable) {
    try {
      await saveRestaurantTable(table);
      onMessage('桌台已保存');
      load();
    } catch (err) {
      onMessage(err instanceof Error ? err.message : String(err));
    }
  }

  async function regenerate(tableId: string) {
    const confirmed = window.confirm(
      '重生成后，旧二维码将立即作废，已打印贴在桌上的二维码需要重新打印和更换。确定继续吗？',
    );
    if (!confirmed) return;

    try {
      await regenerateTableQrToken(tableId);
      onMessage('二维码 token 已重新生成');
      load();
    } catch (err) {
      onMessage(err instanceof Error ? err.message : String(err));
    }
  }

  async function closeSession(sessionId: string) {
    const openCount = orders.filter(
      (order) =>
        order.session_id === sessionId &&
        ['pending', 'preparing', 'served'].includes(order.status),
    ).length;
    if (
      openCount > 0 &&
      !window.confirm(`该桌还有 ${openCount} 张未完成订单，确认清桌吗？`)
    ) {
      return;
    }

    try {
      const result = await closeTableSession(sessionId);
      onMessage(`已清桌，删除未提交购物车 ${result.deleted_cart_count} 条。`);
      load();
    } catch (err) {
      onMessage(err instanceof Error ? err.message : String(err));
    }
  }

  const sessionByTable = useMemo(
    () => new Map(sessions.map((session) => [session.table_id, session])),
    [sessions],
  );

  return (
    <AdminSection title="桌台二维码" onRefresh={load}>
      <div className="admin-form-grid compact-create">
        <TextField label="桌号" value={newNumber} type="number" onChange={(v) => setNewNumber(Number(v))} />
        <TextField label="备注名称" value={newLabel} onChange={setNewLabel} />
        <button className="primary-button" type="button" onClick={addTable}>
          <Plus size={16} />
          新增桌台
        </button>
      </div>
      <div className="table-admin-grid">
        {tables.map((table) => (
          <TableCard
            key={table.id}
            table={table}
            session={sessionByTable.get(table.id) ?? null}
            onSave={saveTable}
            onRegenerate={regenerate}
            onClose={closeSession}
          />
        ))}
      </div>
    </AdminSection>
  );
}

function TableCard({
  table,
  session,
  onSave,
  onRegenerate,
  onClose,
}: {
  table: RestaurantTable;
  session: TableSession | null;
  onSave: (table: RestaurantTable) => void;
  onRegenerate: (tableId: string) => void;
  onClose: (sessionId: string) => void;
}) {
  const [value, setValue] = useState<RestaurantTable>(table);
  const qrRef = useRef<HTMLDivElement | null>(null);
  const tableLabel = table.label || `Table ${table.table_number}`;
  const qrUrl = `${publicSiteUrl}/table/${table.qr_token}`;

  useEffect(() => {
    setValue(table);
  }, [table]);

  async function downloadQrImage() {
    const svg = qrRef.current?.querySelector('svg');
    if (!svg) return;

    const serializer = new XMLSerializer();
    const svgText = serializer.serializeToString(svg);
    const svgBlob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
    const svgUrl = URL.createObjectURL(svgBlob);
    const image = new Image();

    image.onload = () => {
      const canvas = document.createElement('canvas');
      const width = 900;
      const height = 1080;
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#171717';
      ctx.textAlign = 'center';
      ctx.font = '700 72px Arial, sans-serif';
      ctx.fillText(tableLabel, width / 2, 120);
      ctx.font = '400 28px Arial, sans-serif';
      ctx.fillText('Wok Dragon Express', width / 2, 170);
      ctx.drawImage(image, 150, 230, 600, 600);
      ctx.fillStyle = '#555555';
      ctx.font = '400 24px Arial, sans-serif';
      wrapCanvasText(ctx, qrUrl, width / 2, 900, 760, 32);

      const link = document.createElement('a');
      link.download = `wok-dragon-${tableLabel.toLowerCase().replace(/\s+/g, '-')}-qr.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      URL.revokeObjectURL(svgUrl);
    };

    image.src = svgUrl;
  }

  return (
    <article className="table-card">
      <div className="qr-box" ref={qrRef}>
        <strong>{tableLabel}</strong>
        <QRCodeSVG value={qrUrl} size={128} />
      </div>
      <div className="table-card-body">
        <div className="admin-form-grid table-form">
          <TextField label="桌号" value={value.table_number} type="number" onChange={(v) => setValue({ ...value, table_number: Number(v) })} />
          <TextField label="备注" value={value.label} onChange={(v) => setValue({ ...value, label: v })} />
          <label className="checkbox-label">
            <input
              checked={value.is_active}
              type="checkbox"
              onChange={(event) => setValue({ ...value, is_active: event.target.checked })}
            />
            启用
          </label>
        </div>
        <p className="qr-url">{qrUrl}</p>
        <div className="table-primary-action">
          <button
            className="clear-table-button"
            type="button"
            disabled={!session}
            onClick={() => session && onClose(session.id)}
          >
            清桌
          </button>
        </div>
        <div className="table-maintenance-actions">
          <button className="maintenance-button" type="button" onClick={downloadQrImage}>
            <Download size={13} />
            下载二维码
          </button>
          <button className="maintenance-button" type="button" onClick={() => onSave(value)}>
            保存桌台资料
          </button>
          <button className="maintenance-button" type="button" onClick={() => onRegenerate(table.id)}>
            <RotateCcw size={13} />
            重生成二维码
          </button>
        </div>
        <small>
          {session ? '当前有客人会话，日常交接请使用清桌。' : '当前空桌。重生成二维码只在二维码泄露或需要更换时使用。'}
        </small>
      </div>
    </article>
  );
}

function wrapCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
) {
  const words = text.split('');
  let line = '';
  let currentY = y;

  for (const word of words) {
    const testLine = line + word;
    if (ctx.measureText(testLine).width > maxWidth && line) {
      ctx.fillText(line, x, currentY);
      line = word;
      currentY += lineHeight;
    } else {
      line = testLine;
    }
  }

  if (line) ctx.fillText(line, x, currentY);
}

function ImportGuide() {
  return (
    <AdminSection title="CSV 导入模板">
      <p>模板文件位于 `supabase/menu-import-template.csv`。导入后请映射到分类和菜品表。</p>
      <pre className="csv-preview">
category_zh,category_en,category_el,name_zh,name_en,name_el,description_zh,description_en,description_el,price,image_url,is_available,sort_order
      </pre>
    </AdminSection>
  );
}

function SystemSettings() {
  return (
    <AdminSection title="系统设置">
      <div className="admin-panel-card system-settings-card">
        <Settings2 size={24} />
        <div>
          <h2>运行配置</h2>
          <p>菜单、订单、桌台、二维码和权限策略由 Supabase 项目统一管理。此页面仅展示入口，不会绕过现有 RPC 或 RLS。</p>
        </div>
      </div>
      <div className="admin-system-grid">
        <div><strong>实时订单</strong><span>Realtime 订阅已由订单管理页面维护</span></div>
        <div><strong>桌台会话</strong><span>清桌与二维码继续使用现有安全函数</span></div>
        <div><strong>访问控制</strong><span>管理员登录与 RLS 策略保持不变</span></div>
      </div>
    </AdminSection>
  );
}

function AdminSection({
  title,
  children,
  onRefresh,
}: {
  title: string;
  children: ReactNode;
  onRefresh?: () => void;
}) {
  return (
    <section>
      <div className="admin-section-header">
        <h1>{title}</h1>
        {onRefresh ? (
          <button className="secondary-button" onClick={onRefresh} type="button">
            <RefreshCw size={16} />
            刷新
          </button>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  value?: string | number | null;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label>
      {label}
      <input value={value ?? ''} type={type} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function CategoryRow({
  category,
  onSave,
  onDelete,
}: {
  category: MenuCategory;
  onSave: (category: Partial<MenuCategory>) => void;
  onDelete: (category: MenuCategory) => void;
}) {
  const [value, setValue] = useState<Partial<MenuCategory>>(category);
  return (
    <div className="admin-row">
      <CategoryForm value={value} onChange={setValue} />
      <div className="admin-row-actions">
        <button className="small-primary" type="button" onClick={() => onSave(value)}>
          保存
        </button>
        <button className="danger-inline" type="button" onClick={() => onDelete(category)}>
          <Trash2 size={15} />
          删除分类
        </button>
      </div>
    </div>
  );
}

function CategoryForm({
  value,
  onChange,
}: {
  value: Partial<MenuCategory>;
  onChange: (value: Partial<MenuCategory>) => void;
}) {
  return (
    <div className="admin-form-grid compact-grid">
      <TextField label="中文" value={value.name_zh} onChange={(v) => onChange({ ...value, name_zh: v })} />
      <TextField label="英文" value={value.name_en} onChange={(v) => onChange({ ...value, name_en: v })} />
      <TextField label="希腊语" value={value.name_el} onChange={(v) => onChange({ ...value, name_el: v })} />
      <TextField label="排序" value={value.sort_order} type="number" onChange={(v) => onChange({ ...value, sort_order: Number(v) })} />
      <label className="checkbox-label">
        <input
          checked={Boolean(value.is_active)}
          type="checkbox"
          onChange={(event) => onChange({ ...value, is_active: event.target.checked })}
        />
        启用
      </label>
    </div>
  );
}

function ItemRow({
  item,
  categories,
  selected,
  onSelect,
  onMessage,
  onSave,
  onDuplicate,
  onDelete,
}: {
  item: MenuItem;
  categories: MenuCategory[];
  selected: boolean;
  onSelect: (checked: boolean) => void;
  onMessage: (value: string | null) => void;
  onSave: (item: Partial<MenuItem>) => void;
  onDuplicate: (item: MenuItem) => void;
  onDelete: (item: MenuItem) => void;
}) {
  const [value, setValue] = useState<Partial<MenuItem>>(item);
  const [translating, setTranslating] = useState(false);
  const [editing, setEditing] = useState(false);
  const category = categories.find((entry) => entry.id === item.category_id);

  async function autoTranslate() {
    try {
      setTranslating(true);
      setValue(await translateSingleMenuValue(value));
      onMessage('自动翻译已补全缺失字段');
    } catch (err) {
      onMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setTranslating(false);
    }
  }

  return (
    <div className="admin-row">
      <div className="item-row-summary">
        <input aria-label="选择菜品" checked={selected} type="checkbox" onChange={(event) => onSelect(event.target.checked)} />
        <div className="item-summary-name">
          {item.image_url ? <img src={item.image_url} alt="" loading="lazy" /> : <span className="item-image-placeholder">龙</span>}
          <span><strong>{item.name_zh || item.name_en || item.name_el}</strong><small>{item.name_en || item.name_el}</small></span>
        </div>
        <span>{category?.name_zh || category?.name_en || '未分类'}</span>
        <strong>{formatPrice(Number(item.price))}</strong>
        <span className={item.is_available ? 'availability-badge active' : 'availability-badge'}>{item.is_available ? '已上架' : '已下架'}</span>
        <div className="item-row-actions">
          <button type="button" onClick={() => setEditing((open) => !open)}><Pencil size={14} />编辑</button>
          <button type="button" onClick={() => onDuplicate(item)}><Copy size={14} />复制</button>
          <button className="danger-text" type="button" onClick={() => onDelete(item)}><Trash2 size={14} />删除</button>
        </div>
      </div>
      {editing ? (
        <div className="item-row-editor">
          <ItemForm value={value} categories={categories} onChange={setValue} />
          <div className="admin-row-actions">
            <button className="secondary-button" type="button" disabled={translating} onClick={autoTranslate}>
              {translating ? '正在翻译...' : '自动翻译'}
            </button>
            <button className="small-primary" type="button" onClick={() => onSave(value)}>保存修改</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ItemForm({
  value,
  categories,
  onChange,
}: {
  value: Partial<MenuItem>;
  categories: MenuCategory[];
  onChange: (value: Partial<MenuItem>) => void;
}) {
  return (
    <div className="item-editor-grid">
      <div className="item-editor-core">
      <label>
        分类
        <select value={value.category_id ?? ''} onChange={(event) => onChange({ ...value, category_id: event.target.value })}>
          <option value="">未分类</option>
          {categories.map((category) => (
            <option value={category.id} key={category.id}>
              {category.name_zh || category.name_en || category.name_el}
            </option>
          ))}
        </select>
      </label>
      <TextField label="价格" value={value.price} type="number" onChange={(v) => onChange({ ...value, price: Number(v) })} />
      <TextField label="图片 URL" value={value.image_url} onChange={(v) => onChange({ ...value, image_url: v })} />
      <TextField label="排序" value={value.sort_order} type="number" onChange={(v) => onChange({ ...value, sort_order: Number(v) })} />
      <label className="checkbox-label">
        <input
          checked={Boolean(value.is_available)}
          type="checkbox"
          onChange={(event) => onChange({ ...value, is_available: event.target.checked })}
        />
        上架
      </label>
      </div>
      <div className="item-language-field"><strong>简体中文</strong>
        <TextField label="菜品名称" value={value.name_zh} onChange={(v) => onChange({ ...value, name_zh: v })} />
        <TextField label="菜品描述" value={value.description_zh} onChange={(v) => onChange({ ...value, description_zh: v })} />
      </div>
      <div className="item-language-field"><strong>English</strong>
        <TextField label="Name" value={value.name_en} onChange={(v) => onChange({ ...value, name_en: v })} />
        <TextField label="Description" value={value.description_en} onChange={(v) => onChange({ ...value, description_en: v })} />
      </div>
      <div className="item-language-field"><strong>Ελληνικά</strong>
        <TextField label="Όνομα" value={value.name_el} onChange={(v) => onChange({ ...value, name_el: v })} />
        <TextField label="Περιγραφή" value={value.description_el} onChange={(v) => onChange({ ...value, description_el: v })} />
      </div>
    </div>
  );
}
