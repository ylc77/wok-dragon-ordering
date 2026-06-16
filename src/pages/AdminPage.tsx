import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { Ban, CheckCircle2, ChefHat, Clock3, ClipboardList, Download, LogOut, Plus, RefreshCw, RotateCcw, Save, WalletCards } from 'lucide-react';
import { formatPrice } from '../lib/localized';
import { hasSupabaseConfig, supabase } from '../lib/supabase';
import {
  closeTableSession,
  createRestaurantTable,
  fetchActiveSessions,
  fetchAdminOrders,
  fetchRestaurantTables,
  regenerateTableQrToken,
  saveRestaurantTable,
  subscribeToAdminOrders,
  updateOrderStatus,
} from '../lib/orderApi';
import type {
  MenuCategory,
  MenuItem,
  Order,
  OrderStatus,
  RestaurantSettings,
  RestaurantTable,
  TableSession,
} from '../lib/types';

type AdminTab = 'settings' | 'categories' | 'items' | 'orders' | 'tables' | 'import';

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
  const [tab, setTab] = useState<AdminTab>('orders');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setLoggedIn(Boolean(data.session));
      setSessionReady(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setLoggedIn(Boolean(session));
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
          龙城酒楼
          <small>Wok Dragon Express</small>
        </Link>
        <AdminNavButton active={tab === 'orders'} onClick={() => setTab('orders')}>
          订单管理
        </AdminNavButton>
        <AdminNavButton active={tab === 'tables'} onClick={() => setTab('tables')}>
          桌台二维码
        </AdminNavButton>
        <AdminNavButton active={tab === 'settings'} onClick={() => setTab('settings')}>
          餐馆信息
        </AdminNavButton>
        <AdminNavButton active={tab === 'categories'} onClick={() => setTab('categories')}>
          菜单分类
        </AdminNavButton>
        <AdminNavButton active={tab === 'items'} onClick={() => setTab('items')}>
          菜品管理
        </AdminNavButton>
        <AdminNavButton active={tab === 'import'} onClick={() => setTab('import')}>
          CSV 导入
        </AdminNavButton>
        <button
          className="danger"
          onClick={() => supabase?.auth.signOut().then(() => setLoggedIn(false))}
        >
          <LogOut size={16} />
          退出登录
        </button>
      </aside>
      <section className="admin-content">
        {message ? <p className="admin-message">{message}</p> : null}
        {tab === 'orders' ? <OrderManager onMessage={setMessage} /> : null}
        {tab === 'tables' ? <TableManager onMessage={setMessage} /> : null}
        {tab === 'settings' ? <SettingsEditor onMessage={setMessage} /> : null}
        {tab === 'categories' ? <CategoryEditor onMessage={setMessage} /> : null}
        {tab === 'items' ? <ItemEditor onMessage={setMessage} /> : null}
        {tab === 'import' ? <ImportGuide /> : null}
      </section>
    </main>
  );
}

function AdminNavButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button className={active ? 'active' : ''} onClick={onClick} type="button">
      {children}
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
      <div className="admin-form-grid">
        <TextField label="中文名称" value={settings.name_zh} onChange={(v) => setSettings({ ...settings, name_zh: v })} />
        <TextField label="英文名称" value={settings.name_en} onChange={(v) => setSettings({ ...settings, name_en: v })} />
        <TextField label="希腊语名称" value={settings.name_el} onChange={(v) => setSettings({ ...settings, name_el: v })} />
        <TextField label="电话" value={settings.phone} onChange={(v) => setSettings({ ...settings, phone: v })} />
        <TextField label="中文地址" value={settings.address_zh} onChange={(v) => setSettings({ ...settings, address_zh: v })} />
        <TextField label="英文地址" value={settings.address_en} onChange={(v) => setSettings({ ...settings, address_en: v })} />
        <TextField label="希腊语地址" value={settings.address_el} onChange={(v) => setSettings({ ...settings, address_el: v })} />
        <TextField label="地图链接" value={settings.map_url} onChange={(v) => setSettings({ ...settings, map_url: v })} />
        <TextField label="中文营业时间" value={settings.opening_hours_zh} onChange={(v) => setSettings({ ...settings, opening_hours_zh: v })} />
        <TextField label="英文营业时间" value={settings.opening_hours_en} onChange={(v) => setSettings({ ...settings, opening_hours_en: v })} />
        <TextField label="希腊语营业时间" value={settings.opening_hours_el} onChange={(v) => setSettings({ ...settings, opening_hours_el: v })} />
        <TextField label="Wolt 链接" value={settings.wolt_url} onChange={(v) => setSettings({ ...settings, wolt_url: v })} />
        <TextField label="efood 链接" value={settings.efood_url} onChange={(v) => setSettings({ ...settings, efood_url: v })} />
        <TextField label="Box 链接" value={settings.box_url} onChange={(v) => setSettings({ ...settings, box_url: v })} />
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
    const { data, error } = await supabase.from('menu_categories').select('*').order('sort_order');
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

  return (
    <AdminSection title="菜单分类" onRefresh={load}>
      <div className="admin-table">
        {categories.map((category) => (
          <CategoryRow category={category} onSave={saveCategory} key={category.id} />
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

function ItemEditor({ onMessage }: { onMessage: (value: string | null) => void }) {
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [draft, setDraft] = useState<Partial<MenuItem>>(emptyItem);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    if (!supabase) return;
    const [catResult, itemResult] = await Promise.all([
      supabase.from('menu_categories').select('*').order('sort_order'),
      supabase.from('menu_items').select('*').order('sort_order'),
    ]);
    if (catResult.error) onMessage(catResult.error.message);
    if (itemResult.error) onMessage(itemResult.error.message);
    setCategories((catResult.data ?? []) as MenuCategory[]);
    setItems((itemResult.data ?? []) as MenuItem[]);
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

  return (
    <AdminSection title="菜品管理" onRefresh={load}>
      <div className="admin-table item-table">
        {items.map((item) => (
          <ItemRow item={item} categories={categories} onSave={saveItem} key={item.id} />
        ))}
      </div>
      <h3>新增菜品</h3>
      <ItemForm value={draft} categories={categories} onChange={setDraft} />
      <button className="primary-button" type="button" onClick={() => saveItem(draft)}>
        <Plus size={16} />
        新增菜品
      </button>
    </AdminSection>
  );
}

function OrderManager({ onMessage }: { onMessage: (value: string | null) => void }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all');
  const [tableFilter, setTableFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState<'today' | 'all'>('today');
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [newOrderIds, setNewOrderIds] = useState<Set<string>>(new Set());
  const knownOrderIdsRef = useRef<Set<string>>(new Set());
  const soundEnabledRef = useRef(false);

  useEffect(() => {
    load({ initial: true });
    return subscribeToAdminOrders(() => load());
  }, []);

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  async function load(options?: { initial?: boolean }) {
    try {
      const nextOrders = await fetchAdminOrders();
      const previousIds = knownOrderIdsRef.current;
      const insertedPendingOrders = options?.initial
        ? []
        : nextOrders.filter((order) => !previousIds.has(order.id) && order.status === 'pending');

      knownOrderIdsRef.current = new Set(nextOrders.map((order) => order.id));
      setOrders(nextOrders);

      if (insertedPendingOrders.length > 0) {
        setNewOrderIds((current) => {
          const next = new Set(current);
          insertedPendingOrders.forEach((order) => next.add(order.id));
          return next;
        });
        if (soundEnabledRef.current) playOrderNotification();
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

  const scopedOrders = useMemo(
    () =>
      orders.filter((order) => {
        const tableMatches = tableFilter === 'all' || order.restaurant_tables?.table_number === Number(tableFilter);
        const dateMatches = dateFilter === 'all' || isToday(order.created_at);
        return tableMatches && dateMatches;
      }),
    [orders, tableFilter, dateFilter],
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
      <div className="order-tools-row">
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
          <select value={dateFilter} onChange={(event) => setDateFilter(event.target.value as 'today' | 'all')}>
            <option value="today">今日订单</option>
            <option value="all">全部日期</option>
          </select>
        </label>
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
            </footer>
          </article>
        ))}
      </div>
    </AdminSection>
  );
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
}: {
  category: MenuCategory;
  onSave: (category: Partial<MenuCategory>) => void;
}) {
  const [value, setValue] = useState<Partial<MenuCategory>>(category);
  return (
    <div className="admin-row">
      <CategoryForm value={value} onChange={setValue} />
      <button className="small-primary" type="button" onClick={() => onSave(value)}>
        保存
      </button>
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
  onSave,
}: {
  item: MenuItem;
  categories: MenuCategory[];
  onSave: (item: Partial<MenuItem>) => void;
}) {
  const [value, setValue] = useState<Partial<MenuItem>>(item);
  return (
    <div className="admin-row">
      <ItemForm value={value} categories={categories} onChange={setValue} />
      <button className="small-primary" type="button" onClick={() => onSave(value)}>
        保存
      </button>
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
    <div className="admin-form-grid item-grid">
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
      <TextField label="中文名" value={value.name_zh} onChange={(v) => onChange({ ...value, name_zh: v })} />
      <TextField label="英文名" value={value.name_en} onChange={(v) => onChange({ ...value, name_en: v })} />
      <TextField label="希腊语名" value={value.name_el} onChange={(v) => onChange({ ...value, name_el: v })} />
      <TextField label="中文描述" value={value.description_zh} onChange={(v) => onChange({ ...value, description_zh: v })} />
      <TextField label="英文描述" value={value.description_en} onChange={(v) => onChange({ ...value, description_en: v })} />
      <TextField label="希腊语描述" value={value.description_el} onChange={(v) => onChange({ ...value, description_el: v })} />
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
  );
}
