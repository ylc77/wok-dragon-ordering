import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { Activity, Ban, Banknote, BarChart3, Building2, CheckCircle2, ChefHat, ChevronDown, Clock3, ClipboardList, Copy, CreditCard, Database, Download, LayoutDashboard, LogOut, Menu, Minus, PauseCircle, Pencil, PlayCircle, Plus, Printer, QrCode, RefreshCw, RotateCcw, Save, Search, Settings2, ShoppingBag, Tags, Trash2, Upload, UserCircle, UtensilsCrossed, WalletCards, Wifi, WifiOff, X } from 'lucide-react';
import { formatPrice, getLocalizedField } from '../lib/localized';
import { getPublicMenu, getRestaurantSettings, adminHardDeleteMenuCategory, adminHardDeleteMenuItem, uploadCategoryImage, uploadMenuItemImage, uploadRestaurantImage, validateImageFile } from '../lib/menuApi';
import { hasSupabaseConfig, supabase } from '../lib/supabase';
import { downloadFile, exportRowsToCSV, exportRowsToJSON, fetchAllTableData, generateBackupFilename } from '../lib/dataExport';
import {
  adminConfirmOrderPayment,
  adminHardDeleteOrder,
  approveTableReentry,
  closeTableSession,
  confirmBillAndCloseSession,
  createRestaurantTable,
  fetchActiveSessions,
  fetchAdminDashboardSummary,
  fetchAdminOrderPage,
  fetchAdminOrderStats,
  fetchAdminOrders,
  fetchAdminPendingOrders,
  fetchPendingBillRequests,
  fetchPendingTableReentryRequests,
  fetchRestaurantTables,
  markOrderKitchenPrinted,
  posSubmitOrder,
  regenerateTableQrToken,
  rejectTableReentry,
  saveRestaurantTable,
  setRestaurantOrdering,
  subscribeToAdminOrders,
  updateOrderStatus,
} from '../lib/orderApi';
import type {
  BillRequest,
  AdminDashboardSummary,
  AdminOrderStats,
  MenuCategory,
  MenuGroup,
  MenuItem,
  MenuItemOptionGroup,
  Order,
  OrderItem,
  OrderStatus,
  RealtimeConnectionStatus,
  RestaurantSettings,
  RestaurantTable,
  SelectedOption,
  TableReentryRequest,
  TableSession,
} from '../lib/types';

type AdminTab = 'dashboard' | 'settings' | 'categories' | 'items' | 'orders' | 'tables' | 'system' | 'pos';

const emptySettings: Partial<RestaurantSettings> = {
  name_zh: '',
  name_en: '',
  name_el: '',
  logo_url: '',
  hero_image_url: '',
  intro_zh: '',
  intro_en: '',
  intro_el: '',
  phone: '',
  whatsapp_url: '',
  instagram_url: '',
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
  accept_pos_payment: true,
  accept_cash_payment: true,
  ordering_enabled: true,
  ordering_paused_at: null,
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

const publicSiteUrl = window.location.origin;

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

type AggregatedOrderItem = Pick<OrderItem, 'menu_item_id' | 'item_name_zh' | 'item_name_en' | 'item_name_el' | 'note' | 'unit_price'> & {
  key: string;
  quantity: number;
  line_total: number;
};

type OrderSessionGroup = {
  sessionId: string | null;
  tableNumber: number | null;
  orders: Order[];
  total: number;
  newestAt: string;
  items: AggregatedOrderItem[];
  statusCounts: Record<OrderStatus, number>;
  primaryStatus: OrderStatus;
  isClosed: boolean;
};

const orderStatusPriority: OrderStatus[] = ['pending', 'preparing', 'served', 'paid', 'cancelled'];

function groupOrdersBySession(orders: Order[]): OrderSessionGroup[] {
  const groups = new Map<string, OrderSessionGroup>();

  for (const order of orders) {
    // POS 订单无 session_id → 每单独立分组
    const groupKey = order.session_id || order.id;
    let group = groups.get(groupKey);
    if (!group) {
      group = {
        sessionId: order.session_id,
        tableNumber: order.restaurant_tables?.table_number ?? null,
        orders: [],
        total: 0,
        newestAt: order.created_at,
        items: [],
        statusCounts: { pending: 0, preparing: 0, served: 0, paid: 0, cancelled: 0 },
        primaryStatus: order.status,
        isClosed: false,
      };
      groups.set(groupKey, group);
    }

    group.orders.push(order);
    group.total += Number(order.total_price);
    group.statusCounts[order.status] += 1;
    if (new Date(order.created_at).getTime() > new Date(group.newestAt).getTime()) group.newestAt = order.created_at;
  }

  for (const group of groups.values()) {
    const items = new Map<string, AggregatedOrderItem>();
    group.orders.forEach((order) => {
      (order.order_items ?? []).forEach((item) => {
        const itemIdentity = item.menu_item_id ?? `${item.item_name_zh}|${item.item_name_en ?? ''}|${item.item_name_el ?? ''}`;
        const key = `${itemIdentity}|${Number(item.unit_price).toFixed(2)}|${item.note?.trim() ?? ''}`;
        const current = items.get(key);
        if (current) {
          current.quantity += Number(item.quantity);
          current.line_total += Number(item.line_total);
        } else {
          items.set(key, {
            key,
            menu_item_id: item.menu_item_id,
            item_name_zh: item.item_name_zh,
            item_name_en: item.item_name_en,
            item_name_el: item.item_name_el,
            note: item.note,
            unit_price: Number(item.unit_price),
            quantity: Number(item.quantity),
            line_total: Number(item.line_total),
          });
        }
      });
    });
    group.items = Array.from(items.values());
    group.orders.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    group.primaryStatus = orderStatusPriority.find((status) => group.statusCounts[status] > 0) ?? 'cancelled';
    group.isClosed = group.orders.every((order) => order.status === 'paid' || order.status === 'cancelled');
  }

  return Array.from(groups.values()).sort(
    (a, b) => new Date(b.newestAt).getTime() - new Date(a.newestAt).getTime(),
  );
}

export function AdminPage() {
  const [sessionReady, setSessionReady] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [adminEmail, setAdminEmail] = useState('管理员');
  const [tab, setTab] = useState<AdminTab>('dashboard');
  const [message, setMessage] = useState<string | null>(null);
  const [adminToast, setAdminToast] = useState<{ msg: string; type: 'success' | 'error' | 'warning' } | null>(null);
  const adminToastRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showAdminToast(msg: string, type: 'success' | 'error' | 'warning' = 'success', duration = 2500) {
    if (adminToastRef.current) clearTimeout(adminToastRef.current);
    setAdminToast({ msg, type });
    adminToastRef.current = setTimeout(() => setAdminToast(null), duration);
  }

  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeConnectionStatus>('connecting');
  const [adminRole, setAdminRole] = useState<'admin' | 'staff' | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [restaurantName, setRestaurantName] = useState('餐馆');
  const [paperWidth, setPaperWidth] = useState(() => {
    try { const v = localStorage.getItem('restaurant_ticket_paper_width'); return v === '58' ? '58' : '80'; } catch { return '80'; }
  });
  const [syncVersion, setSyncVersion] = useState(0);
  const requestSync = useCallback(() => setSyncVersion((c) => c + 1), []);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  const closeDrawer = () => setMobileDrawerOpen(false);
  const onTabChange = (t: AdminTab) => { setTab(t); closeDrawer(); };

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    let active = true;

    async function syncAdminAccess(session: Session | null) {
      if (!active) return;
      if (!session) {
        setLoggedIn(false);
        setAdminEmail('管理员');
        setSessionReady(true);
        return;
      }

      const { data: profile, error } = await client
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .maybeSingle();
      if (!active) return;

      const allowed = !error && (profile?.role === 'admin' || profile?.role === 'staff');
      setLoggedIn(allowed);
      setAdminEmail(allowed ? (session.user.email ?? '管理员') : '管理员');
      setAdminRole(allowed ? (profile?.role === 'admin' ? 'admin' : 'staff') : null);
      if (allowed) setMessage(null);
      if (!allowed && !session.user.is_anonymous) setMessage('该账户没有后台管理权限');
      setSessionReady(true);
    }

    client.auth.getSession().then(({ data }) => void syncAdminAccess(data.session));
    const { data: listener } = client.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') setMessage('登录会话已失效，请重新登录');
      window.setTimeout(() => void syncAdminAccess(session), 0);
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!supabase) return;
    getRestaurantSettings().then((s) => {
      setRestaurantName(s?.name_zh || s?.name_en || s?.name_el || '餐馆');
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!loggedIn) return;
    let previousStatus: RealtimeConnectionStatus = 'connecting';
    const unsubscribe = subscribeToAdminOrders(requestSync, (status) => {
      setRealtimeStatus(status);
      if (status === 'connected' && previousStatus !== 'connected') requestSync();
      previousStatus = status;
    });
    const interval = window.setInterval(requestSync, 5_000);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') requestSync();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
      unsubscribe();
    };
  }, [loggedIn]);

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
      {/* 桌面端侧边栏 */}
      <aside className="admin-sidebar">
        <Link className="admin-brand" to="/">
          <span className="admin-brand-mark">餐</span>
          <span>后台管理</span>
        </Link>
        <nav className="admin-nav-list">
          <AdminNavButton icon={<LayoutDashboard size={16} />} active={tab === 'dashboard'} onClick={() => onTabChange('dashboard')}>仪表盘</AdminNavButton>
          <AdminNavButton icon={<ClipboardList size={16} />} active={tab === 'orders'} onClick={() => onTabChange('orders')}>订单</AdminNavButton>
          <AdminNavButton icon={<UtensilsCrossed size={16} />} active={tab === 'items'} onClick={() => onTabChange('items')}>菜品</AdminNavButton>
          <AdminNavButton icon={<Tags size={16} />} active={tab === 'categories'} onClick={() => onTabChange('categories')}>分类</AdminNavButton>
          <AdminNavButton icon={<QrCode size={16} />} active={tab === 'tables'} onClick={() => onTabChange('tables')}>桌台</AdminNavButton>
          <AdminNavButton icon={<Building2 size={16} />} active={tab === 'settings'} onClick={() => onTabChange('settings')}>餐馆</AdminNavButton>
          <AdminNavButton icon={<Settings2 size={16} />} active={tab === 'system'} onClick={() => onTabChange('system')}>系统</AdminNavButton>
          <AdminNavButton icon={<ShoppingBag size={16} />} active={tab === 'pos'} onClick={() => onTabChange('pos')}>前台点单</AdminNavButton>
        </nav>
        <button className="admin-logout" onClick={() => supabase?.auth.signOut().then(() => setLoggedIn(false))}>
          <LogOut size={15} />
        </button>
      </aside>

      {/* 移动端抽屉遮罩 */}
      {mobileDrawerOpen ? <div className="admin-mobile-overlay" onClick={closeDrawer} /> : null}
      {/* 移动端抽屉 */}
      <aside className={`admin-mobile-drawer${mobileDrawerOpen ? ' open' : ''}`}>
        <button className="admin-mobile-drawer-close" onClick={closeDrawer} aria-label="关闭"><X size={22} /></button>
        <Link className="admin-brand" to="/" onClick={closeDrawer}><span className="admin-brand-mark">餐</span><span>后台管理</span></Link>
        <nav className="admin-nav-list">
          <AdminNavButton icon={<LayoutDashboard size={16} />} active={tab === 'dashboard'} onClick={() => onTabChange('dashboard')}>仪表盘</AdminNavButton>
          <AdminNavButton icon={<ClipboardList size={16} />} active={tab === 'orders'} onClick={() => onTabChange('orders')}>订单</AdminNavButton>
          <AdminNavButton icon={<UtensilsCrossed size={16} />} active={tab === 'items'} onClick={() => onTabChange('items')}>菜品</AdminNavButton>
          <AdminNavButton icon={<Tags size={16} />} active={tab === 'categories'} onClick={() => onTabChange('categories')}>分类</AdminNavButton>
          <AdminNavButton icon={<QrCode size={16} />} active={tab === 'tables'} onClick={() => onTabChange('tables')}>桌台</AdminNavButton>
          <AdminNavButton icon={<Building2 size={16} />} active={tab === 'settings'} onClick={() => onTabChange('settings')}>餐馆</AdminNavButton>
          <AdminNavButton icon={<Settings2 size={16} />} active={tab === 'system'} onClick={() => onTabChange('system')}>系统</AdminNavButton>
          <AdminNavButton icon={<ShoppingBag size={16} />} active={tab === 'pos'} onClick={() => onTabChange('pos')}>前台点单</AdminNavButton>
        </nav>
        <button className="admin-logout" onClick={() => supabase?.auth.signOut().then(() => setLoggedIn(false))}>退出登录</button>
      </aside>

      <div className="admin-workspace">
        {/* 移动端顶部 */}
        <header className="admin-mobile-topbar">
          <button className="admin-mobile-menu-btn" onClick={() => setMobileDrawerOpen(true)} aria-label="菜单"><Menu size={22} /></button>
          <strong>后台管理</strong>
          <span style={{ flex: 1 }} />
          <span className={`realtime-dot ${realtimeStatus}`} />
        </header>
        {/* 桌面端顶部 */}
        <header className="admin-topbar">
          <strong>餐馆后台管理</strong>
          <div>
            <span className={`realtime-dot ${realtimeStatus}`} title={realtimeStatus === 'connected' ? '实时连接正常' : realtimeStatus === 'connecting' ? '连接中' : '连接中断'} />
            <span className="admin-clock">{new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span>
            <span className="admin-user"><UserCircle size={18} /><b>{adminEmail}</b></span>
            <button className="logout-inline" onClick={() => supabase?.auth.signOut().then(() => setLoggedIn(false))} title="退出登录">
              <LogOut size={16} />
            </button>
          </div>
        </header>
        <section className="admin-content">
          {adminToast ? <div className={`admin-toast toast-${adminToast.type}`}>{adminToast.msg}</div> : null}
          {message ? <p className="admin-message">{message}<button type="button" className="print-warning-dismiss" style={{marginLeft:8}} onClick={()=>setMessage(null)}>×</button></p> : null}
          {tab === 'dashboard' ? <Dashboard syncVersion={syncVersion} onMessage={setMessage} toast={showAdminToast} onOpenOrders={() => setTab('orders')} setTab={setTab} /> : null}
          {tab === 'orders' ? <OrderManager syncVersion={syncVersion} requestSync={requestSync} onMessage={setMessage} toast={showAdminToast} soundEnabled={soundEnabled} onSoundEnabledChange={setSoundEnabled} restaurantName={restaurantName} paperWidth={paperWidth} setPaperWidth={setPaperWidth} /> : null}
          {tab === 'tables' ? <TableManager syncVersion={syncVersion} onMessage={setMessage} toast={showAdminToast} /> : null}
          {tab === 'settings' ? <SettingsEditor onMessage={setMessage} toast={showAdminToast} /> : null}
          {tab === 'categories' ? <CategoryEditor onMessage={setMessage} toast={showAdminToast} /> : null}
          {tab === 'items' ? <ItemEditor onMessage={setMessage} toast={showAdminToast} /> : null}
          {tab === 'system' ? <SystemSettings realtimeStatus={realtimeStatus} adminRole={adminRole} /> : null}
          {tab === 'pos' ? <POSTab toast={showAdminToast} requestSync={requestSync} /> : null}
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
  onMessage, toast, onOpenOrders, syncVersion, setTab,
}: {
  onMessage: (value: string | null) => void;
  toast: (msg: string, type?: 'success' | 'error' | 'warning') => void;
  onOpenOrders: () => void;
  syncVersion: number;
  setTab: (tab: AdminTab) => void;
}) {
  const [summary, setSummary] = useState<AdminDashboardSummary>({
    today_order_count: 0,
    today_revenue: 0,
    pending_count: 0,
    preparing_count: 0,
    hot_items: [],
  });
  const [tableStatuses, setTableStatuses] = useState<{
    active: number; billPending: number; joinRequests: number;
  }>({ active: 0, billPending: 0, joinRequests: 0 });

  useEffect(() => {
    void load();
    void loadTableStatus();
  }, [syncVersion]);

  async function load() {
    try {
      const { from, to } = localDayBounds(new Date());
      setSummary(await fetchAdminDashboardSummary(from, to));
    } catch (err) {
      onMessage(formatUnknownError(err));
    }
  }

  async function loadTableStatus() {
    try {
      const [{ data: sessions }, { data: bills }, { data: reentries }] = await Promise.all([
        supabase!.from('table_sessions').select('id, table_id, restaurant_tables(table_number)').eq('status', 'active'),
        supabase!.from('bill_requests').select('id').eq('status', 'pending'),
        supabase!.from('table_reentry_requests').select('id').eq('status', 'pending'),
      ]);
      setTableStatuses({
        active: sessions?.length ?? 0,
        billPending: bills?.length ?? 0,
        joinRequests: reentries?.length ?? 0,
      });
    } catch { /* silent */ }
  }

  const avgPerOrder = summary.today_order_count > 0 ? Math.round(Number(summary.today_revenue) / summary.today_order_count) : 0;

  return (
    <AdminSection title="经营概览" subtitle="查看今日订单、营业额、桌台状态和热销菜品" onRefresh={load}>
      {/* ─ 核心指标 ─ */}
      <div className="dash-stat-grid">
        <div className="dash-stat accent-red">
          <span>今日订单</span>
          <strong>{summary.today_order_count}</strong>
        </div>
        <div className="dash-stat accent-green">
          <span>今日营业额</span>
          <strong>{formatPrice(Number(summary.today_revenue))}</strong>
        </div>
        <div className="dash-stat accent-orange">
          <span>待处理订单</span>
          <strong>{summary.pending_count}</strong>
        </div>
        <div className="dash-stat accent-blue">
          <span>使用中桌台</span>
          <strong>{tableStatuses.active}</strong>
        </div>
        <div className="dash-stat accent-yellow">
          <span>待付款桌台</span>
          <strong>{tableStatuses.billPending}</strong>
        </div>
        <div className="dash-stat accent-purple">
          <span>待处理加入请求</span>
          <strong>{tableStatuses.joinRequests}</strong>
        </div>
        {summary.today_order_count > 0 ? (
          <div className="dash-stat accent-teal">
            <span>平均客单价</span>
            <strong>{formatPrice(avgPerOrder)}</strong>
          </div>
        ) : null}
      </div>

      {/* ─ 快捷操作 ─ */}
      <div className="dash-quick-actions">
        <button className="quick-action-btn" onClick={() => setTab('orders')}><ClipboardList size={16} />查看订单</button>
        <button className="quick-action-btn" onClick={() => setTab('items')}><UtensilsCrossed size={16} />管理菜品</button>
        <button className="quick-action-btn" onClick={() => setTab('tables')}><QrCode size={16} />管理桌台</button>
        <button className="quick-action-btn" onClick={() => setTab('settings')}><Building2 size={16} />餐馆设置</button>
      </div>

      {/* ─ 热销菜品 ─ */}
      <div className="admin-panel-card">
        <div className="section-title-row compact">
          <div>
            <h2>今日热销菜品</h2>
            <p>不统计已取消订单，按销量排序。</p>
          </div>
          <button className="secondary-button" type="button" onClick={onOpenOrders}>
            <ClipboardList size={16} />查看全部历史订单
          </button>
        </div>
        {summary.hot_items.length === 0 ? (
          <div className="admin-empty-state">
            <BarChart3 size={28} />
            <strong>今天还没有可统计的菜品</strong>
            <span>收到订单后这里会自动更新。</span>
          </div>
        ) : (
          <div className="hot-item-list">
            {summary.hot_items.map((item, index) => (
              <div key={item.name} className={index < 3 ? 'top-three' : ''}>
                <span className="hot-rank">{index + 1}</span>
                <strong>{item.name}</strong>
                <em>{item.quantity} 份</em>
                <b>{formatPrice(item.total)}</b>
              </div>
            ))}
          </div>
        )}
      </div>

      <DailyStats syncVersion={syncVersion} onMessage={onMessage} />
    </AdminSection>
  );
}

function DailyStats({
  syncVersion,
  onMessage,
}: {
  syncVersion: number;
  onMessage: (value: string | null) => void;
}) {
  interface DailyRow {
    date: string;
    orderCount: number;
    revenue: number;
    paidCount: number;
    posCount: number;
    cashCount: number;
  }

  const [rows, setRows] = useState<DailyRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void load();
  }, [syncVersion]);

  async function load() {
    if (!supabase) return;
    setLoading(true);
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
      thirtyDaysAgo.setHours(0, 0, 0, 0);

      const { data, error } = await supabase
        .from('orders')
        .select('created_at, total_price, status, payment_method')
        .gte('created_at', thirtyDaysAgo.toISOString())
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const map = new Map<string, DailyRow>();
      const now = new Date();
      for (let i = 0; i < 30; i++) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        map.set(key, { date: key, orderCount: 0, revenue: 0, paidCount: 0, posCount: 0, cashCount: 0 });
      }

      for (const order of data ?? []) {
        const key = (order.created_at as string).slice(0, 10);
        const row = map.get(key);
        if (!row) continue;
        row.orderCount++;
        if (order.status === 'paid') {
          row.paidCount++;
          row.revenue += Number(order.total_price ?? 0);
        }
        if (order.payment_method === 'pos') row.posCount++;
        else if (order.payment_method === 'cash') row.cashCount++;
      }

      setRows([...map.values()]);
    } catch (err) {
      onMessage(formatUnknownError(err));
    } finally {
      setLoading(false);
    }
  }

  const totalRevenue = rows.reduce((sum, r) => sum + r.revenue, 0);
  const totalOrders = rows.reduce((sum, r) => sum + r.orderCount, 0);

  return (
    <div className="admin-panel-card">
      <div className="section-title-row compact">
        <div>
          <h2>最近 30 天统计</h2>
          <p>合计 {totalOrders} 笔订单，已付款营收 {formatPrice(totalRevenue)}</p>
        </div>
      </div>
      {loading ? (
        <p className="admin-message admin-message-muted">加载中…</p>
      ) : rows.length === 0 ? (
        <div className="admin-empty-state">
          <BarChart3 size={28} />
          <strong>暂无数据</strong>
        </div>
      ) : (
        <div className="daily-stats-table-wrap">
          <table className="daily-stats-table">
            <thead>
              <tr>
                <th>日期</th>
                <th className="num">订单数</th>
                <th className="num">已付款</th>
                <th className="num">营收</th>
                <th className="num">POS</th>
                <th className="num">现金</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.date} className={row.orderCount === 0 ? 'zero-row' : ''}>
                  <td>{row.date}</td>
                  <td className="num">{row.orderCount || '-'}</td>
                  <td className="num">{row.paidCount || '-'}</td>
                  <td className="num">{row.revenue > 0 ? formatPrice(row.revenue) : '-'}</td>
                  <td className="num">{row.posCount || '-'}</td>
                  <td className="num">{row.cashCount || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SettingsEditor({ onMessage, toast }: { onMessage: (value: string | null) => void; toast: (msg: string, type?: 'success' | 'error' | 'warning') => void; }) {
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
    if (settings.accept_pos_payment === false && settings.accept_cash_payment === false) {
      onMessage('现金和刷卡至少需要启用一种付款方式。');
      return;
    }
    const payload = { ...emptySettings, ...settings };
    const { error } = settings.id
      ? await supabase.from('restaurant_settings').update(payload).eq('id', settings.id)
      : await supabase.from('restaurant_settings').insert(payload);
    if (error) onMessage(error.message); else toast('餐馆信息已保存');
    if (!error) load();
  }

  async function toggleOrdering() {
    const nextEnabled = settings.ordering_enabled === false;
    const action = nextEnabled ? '恢复接单' : '暂停接单';
    const msg = nextEnabled ? '确定要恢复接单吗？顾客将可以继续加菜和提交订单。' : '确定要暂停接单吗？暂停后顾客将无法提交新订单，但可以请求结账。';
    if (!window.confirm(msg)) return;
    try {
      const next = await setRestaurantOrdering(nextEnabled);
      setSettings((current) => ({ ...current, ...next }));
      toast(nextEnabled ? '已恢复全店接单' : '已暂停全店接单', 'warning');
    } catch (err) {
      onMessage(formatUnknownError(err));
    }
  }

  return (
    <AdminSection title="餐馆信息" subtitle="管理餐馆名称、地址、营业时间、联系方式、外卖平台和收款方式" onRefresh={load}>
      {/* 接单状态 */}
      <div className="settings-card ordering-status">
        <div>
          {settings.ordering_enabled === false ? <PauseCircle size={26} /> : <PlayCircle size={26} />}
          <span>
            <strong>{settings.ordering_enabled === false ? '全店已暂停接单' : '全店正在接单'}</strong>
            <small>{settings.ordering_enabled === false && settings.ordering_paused_at ? `暂停于 ${new Date(settings.ordering_paused_at).toLocaleString('zh-CN')}` : '顾客可以正常加菜并提交订单'}</small>
          </span>
        </div>
        <button className={settings.ordering_enabled === false ? 'primary-button' : 'settings-danger-btn'} type="button" onClick={toggleOrdering}>
          {settings.ordering_enabled === false ? <PlayCircle size={16} /> : <PauseCircle size={16} />}
          {settings.ordering_enabled === false ? '恢复接单' : '暂停接单'}
        </button>
      </div>

      {/* ── 基础信息 ── */}
      <div className="settings-card">
        <div className="settings-card-head"><h3>基础信息</h3><p className="settings-card-desc">餐馆名称、地址、营业时间和简介会显示在前台页面。</p></div>
        <div className="admin-language-panels">
          <section><h4>简体中文</h4>
            <TextField label="餐馆名称" value={settings.name_zh} onChange={(v) => setSettings({ ...settings, name_zh: v })} />
            <TextField label="地址" value={settings.address_zh} onChange={(v) => setSettings({ ...settings, address_zh: v })} />
            <TextField label="营业时间" value={settings.opening_hours_zh} onChange={(v) => setSettings({ ...settings, opening_hours_zh: v })} />
            <label>餐馆介绍<textarea className="text-field" rows={4} style={{ minHeight: '110px' }} value={settings.intro_zh ?? ''} onChange={(e) => setSettings({ ...settings, intro_zh: e.target.value })} /></label>
          </section>
          <section><h4>English</h4>
            <TextField label="Restaurant name" value={settings.name_en} onChange={(v) => setSettings({ ...settings, name_en: v })} />
            <TextField label="Address" value={settings.address_en} onChange={(v) => setSettings({ ...settings, address_en: v })} />
            <TextField label="Opening hours" value={settings.opening_hours_en} onChange={(v) => setSettings({ ...settings, opening_hours_en: v })} />
            <label>Introduction<textarea className="text-field" rows={4} style={{ minHeight: '110px' }} value={settings.intro_en ?? ''} onChange={(e) => setSettings({ ...settings, intro_en: e.target.value })} /></label>
          </section>
          <section><h4>Ελληνικά</h4>
            <TextField label="Όνομα" value={settings.name_el} onChange={(v) => setSettings({ ...settings, name_el: v })} />
            <TextField label="Διεύθυνση" value={settings.address_el} onChange={(v) => setSettings({ ...settings, address_el: v })} />
            <TextField label="Ωράριο" value={settings.opening_hours_el} onChange={(v) => setSettings({ ...settings, opening_hours_el: v })} />
            <label>Παρουσίαση<textarea className="text-field" rows={4} style={{ minHeight: '110px' }} value={settings.intro_el ?? ''} onChange={(e) => setSettings({ ...settings, intro_el: e.target.value })} /></label>
          </section>
        </div>
      </div>

      {/* ── 品牌图片 ── */}
      <div className="settings-card">
        <div className="settings-card-head"><h3>品牌图片</h3><p className="settings-card-desc">上传餐馆 Logo 和首页主图，用于前台导航栏、首页 Hero 和品牌展示。</p></div>
        <div className="settings-brand-grid">
          <div className="settings-brand-col">
            <h4>Logo</h4>
            <SettingsImageField label="Logo 图片链接" value={settings.logo_url} onChange={(v) => setSettings({ ...settings, logo_url: v })} uploadType="logo" toast={toast} />
            <div className="settings-brand-preview">{settings.logo_url ? <img src={settings.logo_url} alt="Logo" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} /> : <span className="settings-preview-empty">暂无 Logo</span>}</div>
            <p className="settings-image-tip">推荐 512×512 或 600×200，PNG/WebP，透明背景更好。系统自动压缩为 WebP。</p>
          </div>
          <div className="settings-brand-col">
            <h4>首页主图</h4>
            <SettingsImageField label="首页主图链接" value={settings.hero_image_url} onChange={(v) => setSettings({ ...settings, hero_image_url: v })} uploadType="hero" toast={toast} />
            <div className="settings-hero-preview-wrap">{settings.hero_image_url ? <img src={settings.hero_image_url} alt="Hero" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} /> : <span className="settings-preview-empty">暂无首页图</span>}</div>
            <p className="settings-image-tip">推荐 1600×900 或 1920×1080，16:9 横向图。适合餐厅环境、招牌菜、温暖用餐氛围。系统自动压缩为 WebP。</p>
          </div>
        </div>
      </div>

      {/* ── 联系方式 ── */}
      <div className="settings-card">
        <div className="settings-card-head"><h3>联系方式</h3></div>
        <div className="settings-grid-2">
          <TextField label="电话" value={settings.phone} onChange={(v) => setSettings({ ...settings, phone: v })} />
          <TextField label="WhatsApp 链接" value={settings.whatsapp_url} onChange={(v) => setSettings({ ...settings, whatsapp_url: v })} />
          <TextField label="Instagram 链接" value={settings.instagram_url} onChange={(v) => setSettings({ ...settings, instagram_url: v })} />
          <TextField label="Google Maps 链接" value={settings.map_url} onChange={(v) => setSettings({ ...settings, map_url: v })} />
        </div>
      </div>

      {/* ── 外卖平台 ── */}
      <div className="settings-card">
        <div className="settings-card-head"><h3>外卖平台</h3><p className="settings-card-desc">填写后前台会显示对应外卖平台入口，留空则不显示。</p></div>
        <div className="settings-grid-3">
          <TextField label="Wolt 外卖链接" value={settings.wolt_url} onChange={(v) => setSettings({ ...settings, wolt_url: v })} />
          <TextField label="efood 外卖链接" value={settings.efood_url} onChange={(v) => setSettings({ ...settings, efood_url: v })} />
          <TextField label="Box 外卖链接" value={settings.box_url} onChange={(v) => setSettings({ ...settings, box_url: v })} />
        </div>
      </div>

      {/* ── 付款方式 ── */}
      <div className="settings-card">
        <div className="settings-card-head"><h3>顾客付款方式</h3><p className="settings-card-desc">至少保留一种。关闭后，顾客结账弹窗不会显示该选项。</p></div>
        <div className="settings-payment-options">
          <label className={`settings-payment-label${settings.accept_pos_payment !== false ? ' selected' : ''}`}><input type="checkbox" checked={settings.accept_pos_payment !== false} onChange={(e) => setSettings({ ...settings, accept_pos_payment: e.target.checked })} />💳 刷卡 / POS</label>
          <label className={`settings-payment-label${settings.accept_cash_payment !== false ? ' selected' : ''}`}><input type="checkbox" checked={settings.accept_cash_payment !== false} onChange={(e) => setSettings({ ...settings, accept_cash_payment: e.target.checked })} />💵 现金</label>
        </div>
      </div>

      {/* ── 保存栏 ── */}
      <div className="settings-save-bar">
        <span className="settings-save-hint">修改后请点击保存</span>
        <button className="primary-button" type="button" onClick={save} style={{ minWidth: '160px', minHeight: '44px', fontSize: '15px' }}><Save size={16} />保存</button>
      </div>
    </AdminSection>
  );
}

function CategoryEditor({ onMessage, toast }: { onMessage: (value: string | null) => void; toast: (msg: string, type?: 'success' | 'error' | 'warning') => void; }) {
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [draft, setDraft] = useState<Partial<MenuCategory>>(emptyCategory);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<MenuCategory | null>(null);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [catSearch, setCatSearch] = useState('');
  const [catStatusFilter, setCatStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [showNewForm, setShowNewForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    if (!supabase) return;
    const { data, error } = await supabase.from('menu_categories').select('*').is('deleted_at', null).order('sort_order');
    if (error) onMessage(error.message);
    setCategories((data ?? []) as MenuCategory[]);
  }

  async function saveCategory(category: Partial<MenuCategory>) {
    if (!supabase) return;
    const isNew = !category.id;
    const payload = { name_zh: category.name_zh ?? '', name_en: category.name_en ?? '', name_el: category.name_el ?? '', image_url: category.image_url || null, sort_order: Number(category.sort_order ?? 0), is_active: Boolean(category.is_active) };
    const { error } = category.id ? await supabase.from('menu_categories').update(payload).eq('id', category.id) : await supabase.from('menu_categories').insert(payload);
    if (error) onMessage(error.message); else toast(isNew ? '分类已创建' : '分类已保存');
    if (!error) { setDraft(emptyCategory); setShowNewForm(false); setEditingId(null); load(); }
  }

  function promptDeleteCategory(category: MenuCategory) {
    if (!supabase) return;
    setDeleteTarget(category); setDeletePassword(''); setDeleteError(null); setDeleteDialogOpen(true);
  }

  async function executeDeleteCategory() {
    if (!deleteTarget) return;
    if (!deletePassword.trim()) { setDeleteError('请输入删除密码'); return; }
    setDeleting(true); setDeleteError(null);
    try {
      await adminHardDeleteMenuCategory(deleteTarget.id, deletePassword);
      toast(`已删除分类"${deleteTarget.name_zh || deleteTarget.name_en || deleteTarget.name_el}"`);
      setDeleteDialogOpen(false); setDeleteTarget(null); load();
    } catch (err) { setDeleteError(formatUnknownError(err)); }
    finally { setDeleting(false); }
  }

  const filteredCategories = useMemo(() => {
    const kw = catSearch.toLowerCase();
    return categories.filter((c) => {
      if (catStatusFilter === 'active' && !c.is_active) return false;
      if (catStatusFilter === 'inactive' && c.is_active) return false;
      if (kw && ![c.name_zh, c.name_en, c.name_el].some((v) => v?.toLowerCase().includes(kw))) return false;
      return true;
    });
  }, [categories, catSearch, catStatusFilter]);

  const catStats = useMemo(() => ({
    total: categories.length,
    active: categories.filter((c) => c.is_active).length,
    inactive: categories.filter((c) => !c.is_active).length,
  }), [categories]);

  return (
    <AdminSection title="菜单分类" subtitle="管理菜单分类名称、多语言显示、排序和启用状态" onRefresh={load}>
      {/* ─ 统计卡片 ─ */}
      <div className="item-stats-row">
        <div className="istat"><span>分类总数</span><strong>{catStats.total}</strong></div>
        <div className="istat istat-green"><span>已启用</span><strong>{catStats.active}</strong></div>
        <div className="istat istat-gray"><span>已禁用</span><strong>{catStats.inactive}</strong></div>
      </div>

      {/* ─ 工具栏 ─ */}
      <div className="item-toolbar">
        <span className="search-input-wrap"><Search size={16} /><input value={catSearch} onChange={(e) => setCatSearch(e.target.value)} placeholder="搜索分类…" /></span>
        <select value={catStatusFilter} onChange={(e) => setCatStatusFilter(e.target.value as typeof catStatusFilter)}>
          <option value="all">全部状态</option><option value="active">已启用</option><option value="inactive">已禁用</option>
        </select>
        {!showNewForm ? (
          <button className="primary-button" type="button" onClick={() => { setShowNewForm(true); setDraft(emptyCategory); }}>
            <Plus size={15} />新增分类
          </button>
        ) : null}
      </div>

      {/* ─ 新增表单 ─ */}
      {showNewForm ? (
        <div className="item-new-form">
          <CategoryForm value={draft} onChange={setDraft} onToast={toast} />
          <div className="item-new-form-actions">
            <button className="secondary-button" type="button" onClick={() => { setShowNewForm(false); setDraft(emptyCategory); }}>取消</button>
            <button className="primary-button" type="button" onClick={() => saveCategory(draft)}><Plus size={15} />创建分类</button>
          </div>
        </div>
      ) : null}

      {/* ─ 分类列表 ─ */}
      <div className="admin-table">
        <div className="cat-table-head" aria-hidden="true"><span>中文名</span><span>英文名</span><span>希腊语</span><span>排序</span><span>状态</span><span>操作</span></div>
        {filteredCategories.map((c) => (
          <div className="admin-row" key={c.id}>
            {editingId === c.id ? (
              <>
                <CategoryForm value={{ ...c }} onChange={(v) => setCategories((prev) => prev.map((x) => x.id === c.id ? { ...x, ...v } : x))} onToast={toast} />
                <div className="admin-row-actions">
                  <button className="primary-button" type="button" onClick={() => saveCategory(categories.find((x) => x.id === c.id) ?? c)}>保存修改</button>
                  <button className="secondary-button" type="button" onClick={() => setEditingId(null)}>取消</button>
                </div>
              </>
            ) : (
              <div className="cat-row-summary">
                <span><strong>{c.name_zh || '未填写'}</strong></span>
                <span>{c.name_en || <span className="item-name-el">未填写</span>}</span>
                <span className="item-name-el">{c.name_el || '未填写'}</span>
                <span>{c.sort_order}</span>
                <span className={`availability-badge${c.is_active ? ' active' : ''}`}>{c.is_active ? '启用' : '禁用'}</span>
                <div className="item-row-actions">
                  <button type="button" onClick={() => setEditingId(c.id)}><Pencil size={14} />编辑</button>
                  <button className="danger-text" type="button" onClick={() => promptDeleteCategory(c)}><Trash2 size={14} />删除</button>
                </div>
              </div>
            )}
          </div>
        ))}
        {filteredCategories.length === 0 ? <div className="admin-empty-state"><strong>没有匹配的分类</strong></div> : null}
      </div>

      {deleteDialogOpen && deleteTarget ? (
        <div className="print-confirm-overlay" onClick={() => { if (!deleting) { setDeleteDialogOpen(false); setDeleteTarget(null); } }}>
          <div className="print-confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <h2>删除分类验证</h2>
            <p className="dialog-warning-text">
              ⚠ 此操作将<strong>永久删除</strong>分类"{deleteTarget.name_zh || deleteTarget.name_en || deleteTarget.name_el}"。旗下菜品将变为"未分类"。
            </p>
            <div className="dialog-password-wrap">
              <label className="dialog-password-label">请输入删除密码</label>
              <input type="password" className="text-field" value={deletePassword} onChange={(e) => { setDeletePassword(e.target.value); setDeleteError(null); }} placeholder="输入删除密码" autoFocus disabled={deleting} onKeyDown={(e) => { if (e.key === 'Enter' && !deleting) void executeDeleteCategory(); }} />
            </div>
            {deleteError ? <p className="dialog-error-text">{deleteError}</p> : null}
            <div className="print-confirm-actions">
              <button className="secondary-button" type="button" onClick={() => { setDeleteDialogOpen(false); setDeleteTarget(null); }} disabled={deleting}>取消</button>
              <button className={deleting ? 'primary-button' : 'primary-button dialog-danger-button'} type="button" onClick={() => void executeDeleteCategory()} disabled={deleting}><Trash2 size={16} />{deleting ? '删除中…' : '确认永久删除'}</button>
            </div>
          </div>
        </div>
      ) : null}
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

function ItemEditor({ onMessage, toast }: { onMessage: (value: string | null) => void; toast: (msg: string, type?: 'success' | 'error' | 'warning') => void; }) {
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
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ ids: string[]; label: string } | null>(null);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);
  const [showCsvImport, setShowCsvImport] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    if (!supabase) return;
    const [catResult, itemResult] = await Promise.all([
      supabase.from('menu_categories').select('*').is('deleted_at', null).order('sort_order'),
      supabase.from('menu_items').select('*, options').is('deleted_at', null).order('sort_order'),
    ]);
    if (catResult.error) onMessage(catResult.error.message);
    if (itemResult.error) onMessage(itemResult.error.message);
    setCategories((catResult.data ?? []) as MenuCategory[]);
    setItems((itemResult.data ?? []) as MenuItem[]);
  }

  const [itemPage, setItemPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

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

  const totalItemPages = Math.max(1, Math.ceil(filteredItems.length / ITEMS_PER_PAGE));
  const pagedItems = useMemo(
    () => filteredItems.slice((itemPage - 1) * ITEMS_PER_PAGE, itemPage * ITEMS_PER_PAGE),
    [filteredItems, itemPage],
  );

  const selectedItems = useMemo(
    () => items.filter((item) => selectedIds.has(item.id)),
    [items, selectedIds],
  );

  useEffect(() => { setItemPage(1); }, [categoryFilter, searchTerm]);

  const itemStats = useMemo(() => {
    const all = items.filter((i) => !i.deleted_at);
    return {
      total: all.length,
      available: all.filter((i) => i.is_available && !i.is_sold_out).length,
      soldOut: all.filter((i) => i.is_sold_out).length,
      delisted: all.filter((i) => !i.is_available).length,
    };
  }, [items]);

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
    const { error } = await supabase.from('menu_items').update({ is_available: isAvailable, is_sold_out: false }).in('id', Array.from(selectedIds));
    if (error) onMessage(error.message); else toast(`已批量${isAvailable ? '上架' : '下架'} ${selectedIds.size} 个菜品`);
    if (!error) {
      setSelectedIds(new Set());
      load();
    }
  }

  async function bulkUpdateSoldOut(soldOut: boolean) {
    if (!supabase || selectedIds.size === 0) return;
    const { error } = await supabase.from('menu_items').update({ is_sold_out: soldOut, is_available: true }).in('id', Array.from(selectedIds));
    if (error) onMessage(error.message); else toast(`已标记${soldOut ? '售罄' : '有货'} ${selectedIds.size} 个菜品`);
    if (!error) {
      setSelectedIds(new Set());
      load();
    }
  }

  function promptDeleteItems(ids: string[], label: string) {
    setDeleteTarget({ ids, label });
    setDeletePassword('');
    setDeleteError(null);
    setDeleteDialogOpen(true);
  }

  async function executeDeleteItems() {
    if (!deleteTarget || deleteTarget.ids.length === 0) return;
    if (!deletePassword.trim()) {
      setDeleteError('请输入删除密码');
      return;
    }
    setDeleting(true);
    setDeleteError(null);
    try {
      for (const id of deleteTarget.ids) {
        await adminHardDeleteMenuItem(id, deletePassword);
      }
      toast(`已永久删除 ${deleteTarget.ids.length} 个菜品`);
      setSelectedIds(new Set());
      setDeleteDialogOpen(false);
      setDeleteTarget(null);
      load();
    } catch (err) {
      setDeleteError(formatUnknownError(err));
    } finally {
      setDeleting(false);
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
    if (error) onMessage(error.message); else toast(`已批量修改 ${selectedIds.size} 个菜品价格`);
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
    link.download = `restaurant-menu-${dateToKey(new Date().toISOString())}.csv`;
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
      onMessage(formatUnknownError(err));
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
          result.errors.push(`第 ${index + 2} 行翻译失败：${formatUnknownError(err)}`);
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
        result.errors.push(`第 ${index + 2} 行：${formatUnknownError(err)}`);
      }
    }

    setCsvResult(result);
    toast(`导入完成：成功 ${result.success} 条，失败 ${result.failed} 条`);
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
      is_sold_out: Boolean(item.is_sold_out),
      sort_order: Number(item.sort_order ?? 0),
      options: item.options ?? [],
    };
    const { error } = item.id
      ? await supabase.from('menu_items').update(payload).eq('id', item.id)
      : await supabase.from('menu_items').insert(payload);
    if (error) onMessage(error.message); else toast('菜品已保存');
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
      toast('自动翻译完成');
    } catch (err) {
      onMessage(formatUnknownError(err));
    } finally {
      setTranslatingDraft(false);
    }
  }

  return (
    <AdminSection title="菜品管理" subtitle="管理菜单菜品、价格、分类、图片和上下架状态" onRefresh={load}>
      {/* ─ 统计卡片 ─ */}
      <div className="item-stats-row">
        <div className="istat"><span>菜品总数</span><strong>{itemStats.total}</strong></div>
        <div className="istat istat-green"><span>已上架</span><strong>{itemStats.available}</strong></div>
        <div className="istat istat-gray"><span>已下架</span><strong>{itemStats.delisted}</strong></div>
        <div className="istat istat-orange"><span>售罄</span><strong>{itemStats.soldOut}</strong></div>
      </div>

      {/* 顶部工具栏 */}
      <div className="item-toolbar">
        <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
          <option value="all">全部分类</option>
          {categories.map((category) => (
            <option value={category.id} key={category.id}>
              {category.name_zh || category.name_en || category.name_el}
            </option>
          ))}
        </select>
        <span className="search-input-wrap">
          <Search size={16} />
          <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="搜索…" />
        </span>
        <button className="secondary-button" type="button" onClick={() => setShowNewForm((v) => !v)}>
          <Plus size={15} />
          {showNewForm ? '收起' : '新增'}
        </button>
        <button className="secondary-button" type="button" onClick={() => { setShowCsvImport((v) => !v); }}>
          <Upload size={15} />
          {showCsvImport ? '收起' : '导入'}
        </button>
        <button
          className="secondary-button"
          type="button"
          onClick={() => {
            const header = 'category_zh,category_en,category_el,name_zh,name_en,name_el,description_zh,description_en,description_el,price,image_url,is_available,sort_order';
            downloadFile(header, 'menu-import-template.csv', 'text/csv;charset=utf-8');
          }}
        >
          <Download size={15} />
          模板
        </button>
        <button className="secondary-button" type="button" onClick={exportCsv}>
          <Download size={15} />
          导出
        </button>
      </div>

      {/* - 新增菜品表单（可折叠） - */}
      {showNewForm ? (
        <div className="item-new-form">
          <ItemForm value={draft} categories={categories} onChange={setDraft} onToast={toast} />
          <div className="item-new-form-actions">
            <button className="secondary-button" type="button" disabled={translatingDraft} onClick={autoTranslateDraft}>
              {translatingDraft ? '翻译中…' : '自动翻译'}
            </button>
            <button className="primary-button" type="button" onClick={() => { void saveItem(draft).then(() => setShowNewForm(false)); }}>
              <Plus size={15} />
              保存
            </button>
          </div>
        </div>
      ) : null}

      {/* - CSV 导入面板（可折叠） - */}
      {showCsvImport ? (
        <div className="csv-import-panel">
          <label>
            选择 CSV 文件
            <input accept=".csv,text/csv" type="file" onChange={(event) => previewCsv(event.target.files?.[0] ?? null)} />
          </label>
          <button className="primary-button" type="button" disabled={csvPreview.length === 0} onClick={importCsv}>
            <Upload size={15} />
            确认导入
          </button>
          {csvPreview.length > 0 ? <span>预览 {csvPreview.length} 条</span> : null}
          {csvResult ? (
            <strong className={csvResult.failed > 0 ? 'csv-result-warn' : 'csv-result-ok'}>
              成功 {csvResult.success} / 失败 {csvResult.failed}
              {csvResult.translationFailed > 0 ? ` / 翻译失败 ${csvResult.translationFailed}` : ''}
            </strong>
          ) : null}
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
        </div>
      ) : null}

        <div className="bulk-action-bar">
          <label className="checkbox-label">
            <input
              checked={filteredItems.length > 0 && filteredItems.every((item) => selectedIds.has(item.id))}
              type="checkbox"
              onChange={(event) => toggleSelectVisible(event.target.checked)}
            />
            全选
          </label>
          <strong>已选 {selectedItems.length} 项</strong>
          <input value={bulkPrice} type="number" min="0" step="0.01" placeholder="新价格" onChange={(event) => setBulkPrice(event.target.value)} />
          <button className="secondary-button" type="button" disabled={selectedIds.size === 0} onClick={bulkUpdatePrice}>批量改价</button>
          <button className="secondary-button" type="button" disabled={selectedIds.size === 0} onClick={() => bulkUpdateAvailability(true)}>标记有货</button>
          <button className="secondary-button" type="button" disabled={selectedIds.size === 0} onClick={() => bulkUpdateSoldOut(true)}>标记售罄</button>
          <button className="danger-inline" type="button" disabled={selectedIds.size === 0} onClick={() => bulkUpdateAvailability(false)}>批量下架</button>
          <button className="danger-inline" type="button" disabled={selectedIds.size === 0} onClick={() => promptDeleteItems(Array.from(selectedIds), `批量删除 ${selectedIds.size} 个菜品`)}>
            <Trash2 size={14} /> 删除
          </button>
          {selectedIds.size > 0 ? <button className="secondary-button" type="button" onClick={() => setSelectedIds(new Set())}>取消选择</button> : null}
        </div>

      {/* - 菜品列表 - */}
      <div className="admin-table item-table">
        <div className="item-table-head" aria-hidden="true">
          <span>选择</span><span>菜品</span><span>分类</span><span>价格</span><span>状态</span><span>操作</span>
        </div>
        {pagedItems.map((item) => (
          <ItemRow
            item={item}
            categories={categories}
            selected={selectedIds.has(item.id)}
            onSelect={(checked) => toggleSelect(item.id, checked)}
            onMessage={onMessage}
            onSave={saveItem}
            onDuplicate={duplicateItem}
            onDelete={(target) => promptDeleteItems([target.id], `删除菜品"${target.name_zh || target.name_en || target.name_el}"`)}
            toast={toast}
            key={item.id}
          />
        ))}
        {filteredItems.length === 0 ? (
          <div className="admin-empty-state" style={{ padding: '24px' }}>
            <UtensilsCrossed size={24} />
            <strong>没有匹配的菜品</strong>
          </div>
        ) : null}
      </div>

      {totalItemPages > 1 ? (
        <nav className="item-pagination">
          <button className="secondary-button" type="button" disabled={itemPage <= 1} onClick={() => setItemPage((p) => p - 1)}>上一页</button>
          <span>{itemPage} / {totalItemPages}（共 {filteredItems.length} 个菜品）</span>
          <button className="secondary-button" type="button" disabled={itemPage >= totalItemPages} onClick={() => setItemPage((p) => p + 1)}>下一页</button>
        </nav>
      ) : null}

      {deleteDialogOpen && deleteTarget ? (
        <div className="print-confirm-overlay" onClick={() => { if (!deleting) { setDeleteDialogOpen(false); setDeleteTarget(null); } }}>
          <div className="print-confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <h2>删除菜品验证</h2>
            <p className="dialog-warning-text">
              ⚠ 此操作将<strong>永久删除</strong>{deleteTarget.ids.length} 个菜品。历史订单中的菜名快照不受影响。
            </p>
            <div className="dialog-password-wrap">
              <label className="dialog-password-label">
                请输入删除密码
              </label>
              <input
                type="password"
                className="text-field"
                value={deletePassword}
                onChange={(e) => { setDeletePassword(e.target.value); setDeleteError(null); }}
                placeholder="输入删除密码"
                autoFocus
                disabled={deleting}
                onKeyDown={(e) => { if (e.key === 'Enter' && !deleting) void executeDeleteItems(); }}
              />
            </div>
            {deleteError ? (
              <p className="dialog-error-text">{deleteError}</p>
            ) : null}
            <div className="print-confirm-actions">
              <button className="secondary-button" type="button" onClick={() => { setDeleteDialogOpen(false); setDeleteTarget(null); }} disabled={deleting}>取消</button>
              <button className={deleting ? 'primary-button' : 'primary-button dialog-danger-button'} type="button" onClick={() => void executeDeleteItems()} disabled={deleting}><Trash2 size={16} />{deleting ? '删除中…' : '确认永久删除'}</button>
            </div>
          </div>
        </div>
      ) : null}
    </AdminSection>
  );
}

function OrderManager({ onMessage, toast, syncVersion, requestSync, soundEnabled, onSoundEnabledChange, restaurantName, paperWidth, setPaperWidth }: { onMessage: (value: string | null) => void; toast: (msg: string, type?: 'success' | 'error' | 'warning') => void; syncVersion: number; requestSync: () => void; soundEnabled: boolean; onSoundEnabledChange: (v: boolean) => void; restaurantName: string; paperWidth: string; setPaperWidth: (v: string) => void; }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [billRequests, setBillRequests] = useState<BillRequest[]>([]);
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all');
  const [tableFilter, setTableFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState<'today' | 'yesterday' | '7days' | 'all' | 'custom'>('today');
  const [customDate, setCustomDate] = useState(dateToKey(new Date().toISOString()));
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalSessions, setTotalSessions] = useState(0);
  const [tableOptions, setTableOptions] = useState<number[]>([]);
  const [stats, setStats] = useState<AdminOrderStats>({
    total_orders: 0, pending: 0, preparing: 0, served: 0, paid: 0, cancelled: 0, paid_total: 0,
  });
  const [autoPrintEnabled, setAutoPrintEnabled] = useState(false);
  const [printWarning, setPrintWarning] = useState<string | null>(null);
  const [confirmingBillIds, setConfirmingBillIds] = useState<Set<string>>(new Set());
  const confirmingBillIdsRef = useRef<Set<string>>(new Set());
  const [newOrderIds, setNewOrderIds] = useState<Set<string>>(new Set());
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
  const [expandedSessionIds, setExpandedSessionIds] = useState<Set<string>>(new Set());
  const knownOrderIdsRef = useRef<Set<string>>(new Set());
  const knownOrderItemIdsRef = useRef<Set<string>>(new Set());
  const knownBillRequestIdsRef = useRef<Set<string>>(new Set());
  const soundEnabledRef = useRef(false);
  const autoPrintEnabledRef = useRef(false);
  const autoPrintWindowRef = useRef<Window | null>(null);
  const autoPrintQueueRef = useRef<Promise<void>>(Promise.resolve());
  const autoPrintingOrderIdsRef = useRef<Set<string>>(new Set());
  const initializedSessionIdsRef = useRef<Set<string>>(new Set());
  const expandedNewOrderIdsRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);
  const [printConfirmOrder, setPrintConfirmOrder] = useState<Order | null>(null);
  const [orderSearch, setOrderSearch] = useState('');

  useEffect(() => {
    void load({ initial: !initializedRef.current });
    initializedRef.current = true;
  }, [syncVersion, page, statusFilter, tableFilter, dateFilter, customDate]);

  useEffect(() => {
    return () => {
      autoPrintEnabledRef.current = false;
      if (autoPrintWindowRef.current && !autoPrintWindowRef.current.closed) {
        autoPrintWindowRef.current.close();
      }
    };
  }, []);

  useEffect(() => {
    setPage(1);
    setSelectedOrderIds(new Set());
  }, [statusFilter, tableFilter, dateFilter, customDate]);

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  useEffect(() => {
    try {
      if (localStorage.getItem('restaurant_auto_print_enabled') === '1') {
        toast('自动打印已保存为开启，请点击「启用自动打印」以恢复');
      }
    } catch { /* noop */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function load(options?: { initial?: boolean }) {
    try {
      const bounds = orderDateBounds(dateFilter, customDate);
      const [orderPage, nextStats, nextBillRequests, pendingOrders, tables] = await Promise.all([
        fetchAdminOrderPage({
          dateFrom: bounds.from,
          dateTo: bounds.to,
          tableNumber: tableFilter === 'all' ? null : Number(tableFilter),
          status: statusFilter === 'all' ? null : statusFilter,
          page,
        }),
        fetchAdminOrderStats({
          dateFrom: bounds.from,
          dateTo: bounds.to,
          tableNumber: tableFilter === 'all' ? null : Number(tableFilter),
        }),
        fetchPendingBillRequests(),
        fetchAdminPendingOrders(),
        fetchRestaurantTables(),
      ]);
      const previousIds = knownOrderIdsRef.current;
      const previousItemIds = knownOrderItemIdsRef.current;
      const previousBillIds = knownBillRequestIdsRef.current;
      const insertedPendingOrders = options?.initial
        ? []
        : pendingOrders.filter((order) => !previousIds.has(order.id));
      const allOrderItems = pendingOrders.flatMap((order) => (order.order_items ?? []));
      const newOrderItems = options?.initial
        ? []
        : allOrderItems.filter((item) => !previousItemIds.has(item.id));

      knownOrderIdsRef.current = new Set(pendingOrders.map((order) => order.id));
      knownOrderItemIdsRef.current = new Set(allOrderItems.map((item) => item.id));
      knownBillRequestIdsRef.current = new Set(nextBillRequests.map((request) => request.id));
      setOrders(orderPage.orders);
      setStats(nextStats);
      setTotalPages(orderPage.total_pages);
      setTotalSessions(orderPage.total_sessions);
      if (page > orderPage.total_pages) setPage(orderPage.total_pages);
      setTableOptions(tables.filter((table) => table.is_active).map((table) => table.table_number));
      setBillRequests(nextBillRequests.filter((r) => !confirmingBillIdsRef.current.has(r.id)));

      const hasNewBillRequest = !options?.initial && nextBillRequests.some((request) => !previousBillIds.has(request.id));
      if (insertedPendingOrders.length > 0 || newOrderItems.length > 0 || hasNewBillRequest) {
        setNewOrderIds((current) => {
          const next = new Set(current);
          insertedPendingOrders.forEach((order) => next.add(order.id));
          return next;
        });
        if (soundEnabledRef.current) playOrderNotification();
      }
      if (autoPrintEnabledRef.current) {
        // 新订单 + 加餐（已有订单中新增 order_items 且打印标记已重置）
        const newOrderIds = new Set(insertedPendingOrders.map((o) => o.id));
        const repopulatedOrders = pendingOrders.filter((order) =>
          !newOrderIds.has(order.id) &&
          !order.kitchen_printed_at &&
          order.order_items?.some((item) => newOrderItems.some((ni) => ni.id === item.id)),
        );
        queueAutoPrint([
          ...insertedPendingOrders.filter((order) => !order.kitchen_printed_at),
          ...repopulatedOrders,
        ]);
      }
    } catch (err) {
      onMessage(formatUnknownError(err));
    }
  }

  async function changeStatus(orderId: string, status: OrderStatus) {
    try {
      await updateOrderStatus(orderId, status);
      toast('订单状态已更新');
      load();
    } catch (err) {
      onMessage(formatUnknownError(err));
    }
  }

  const [payOrder, setPayOrder] = useState<Order | null>(null);
  const [paying, setPaying] = useState(false);

  async function confirmPayment(method: 'cash' | 'pos') {
    if (!payOrder) return;
    try {
      setPaying(true);
      const result = await adminConfirmOrderPayment(payOrder.id, method);
      const msg = result.session_closed
        ? `已收款 ${result.paid_orders_count} 笔订单并清桌`
        : `已收款`;
      toast(msg);
      setPayOrder(null);
      load();
    } catch (err) {
      toast(formatUnknownError(err), 'error');
    } finally {
      setPaying(false);
    }
  }

  async function confirmBillPayment(request: BillRequest) {
    const nextConfirming = new Set(confirmingBillIdsRef.current).add(request.id);
    confirmingBillIdsRef.current = nextConfirming;
    setConfirmingBillIds(nextConfirming);
    setBillRequests((prev) => prev.filter((r) => r.id !== request.id));
    try {
      const result = await confirmBillAndCloseSession(request.session_id);
      toast(`已付款并清桌：${result.paid_order_count} 张订单已结清`);
      load();
    } catch (err) {
      const msg = formatUnknownError(err);
      if (!msg.includes('already closed')) {
        setBillRequests((prev) => [request, ...prev]);
      }
      onMessage(msg);
    } finally {
      confirmingBillIdsRef.current.delete(request.id);
      setConfirmingBillIds((prev) => {
        const next = new Set(prev);
        next.delete(request.id);
        return next;
      });
    }
    load();
  }

  async function doPrintKitchenTicket(order: Order) {
    const printWindow = window.open('', '_blank', 'width=420,height=720');
    if (!printWindow) {
      onMessage('浏览器阻止了打印窗口，请允许此网站打开弹窗后重试');
      return;
    }

    printWindow.document.write('<p style="font-family:sans-serif;padding:20px">正在准备厨房小票...</p>');
    try {
      const isReprint = Boolean(order.kitchen_printed_at);
      await renderAndPrintKitchenTicket(printWindow, buildKitchenTicket(order, isReprint, new Date().toISOString(), restaurantName, undefined, paperWidth));
      printWindow.close();
      await markOrderKitchenPrinted(order.id);
      toast(isReprint ? `订单 #${order.order_number} 已重打厨房小票` : `订单 #${order.order_number} 厨房小票已打印`);
      load();
    } catch (err) {
      printWindow.close();
      onMessage(formatUnknownError(err));
    }
  }

  function printKitchenTicket(order: Order) {
    setPrintConfirmOrder(order);
  }

  function previewKitchenTicket(order: Order) {
    const isReprint = Boolean(order.kitchen_printed_at);
    const ticketHtml = buildKitchenTicket(order, isReprint, new Date().toISOString(), restaurantName, undefined, paperWidth);
    const previewWindow = window.open('', 'kitchen-ticket-preview', 'width=420,height=720');
    if (!previewWindow) {
      toast('浏览器阻止了预览窗口，请允许弹窗');
      return;
    }
    previewWindow.document.open();
    previewWindow.document.write(ticketHtml);
    previewWindow.document.close();
    previewWindow.focus();
  }

  function toggleAutoPrint() {
    if (autoPrintEnabledRef.current) {
      autoPrintEnabledRef.current = false;
      setAutoPrintEnabled(false);
      try { localStorage.setItem('restaurant_auto_print_enabled', '0'); } catch { /* noop */ }
      if (autoPrintWindowRef.current && !autoPrintWindowRef.current.closed) {
        autoPrintWindowRef.current.close();
      }
      autoPrintWindowRef.current = null;
      toast('自动打印厨房小票已关闭');
      return;
    }

    const printWindow = window.open('', 'restaurant-kitchen-printer', 'width=420,height=720');
    if (!printWindow) {
      toast('浏览器阻止了自动打印窗口，请允许弹窗后重新启用');
      return;
    }

    printWindow.document.open();
    printWindow.document.write(buildPrinterReadyScreen());
    printWindow.document.close();
    autoPrintWindowRef.current = printWindow;
    autoPrintEnabledRef.current = true;
    setAutoPrintEnabled(true);
    try { localStorage.setItem('restaurant_auto_print_enabled', '1'); } catch { /* noop */ }
    toast('自动打印厨房小票已开启');
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
      setPrintWarning('自动打印窗口已意外关闭，新订单无法自动打印。请重新启用。');
      return;
    }

    await renderAndPrintKitchenTicket(printWindow, buildKitchenTicket(order, false, new Date().toISOString(), restaurantName, undefined, paperWidth));
    await markOrderKitchenPrinted(order.id);
    toast(`新订单 #${order.order_number} 已触发自动打印厨房小票`);
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

  function toggleSessionSelection(sessionOrders: Order[], checked: boolean) {
    setSelectedOrderIds((current) => {
      const next = new Set(current);
      sessionOrders.forEach((order) => {
        if (checked) next.add(order.id);
        else next.delete(order.id);
      });
      return next;
    });
  }

  function setSessionExpanded(sessionId: string, expanded: boolean) {
    setExpandedSessionIds((current) => {
      const next = new Set(current);
      if (expanded) next.add(sessionId);
      else next.delete(sessionId);
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

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ ids: string[]; label: string } | null>(null);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  function promptDeleteOrders(ids: string[], label: string) {
    setDeleteTarget({ ids, label });
    setDeletePassword('');
    setDeleteError(null);
    setDeleteDialogOpen(true);
  }

  async function executeDeleteOrders() {
    if (!deleteTarget || deleteTarget.ids.length === 0) return;
    if (!deletePassword.trim()) {
      setDeleteError('请输入删除密码');
      return;
    }
    setDeleting(true);
    setDeleteError(null);
    try {
      for (const id of deleteTarget.ids) {
        await adminHardDeleteOrder(id, deletePassword);
      }
      toast(`已永久删除 ${deleteTarget.ids.length} 张订单`);
      setSelectedOrderIds(new Set());
      setDeleteDialogOpen(false);
      setDeleteTarget(null);
      load();
    } catch (err) {
      setDeleteError(formatUnknownError(err));
    } finally {
      setDeleting(false);
    }
  }

  const statusCounts = stats;
  const filteredOrders = orders;

  const groupedOrders = useMemo(() => groupOrdersBySession(filteredOrders), [filteredOrders]);

  useEffect(() => {
    setExpandedSessionIds((current) => {
      const next = new Set(current);
      groupedOrders.forEach((group) => {
        if (group.sessionId === null) return; // POS 无 session 订单跳过
        if (!initializedSessionIdsRef.current.has(group.sessionId)) {
          initializedSessionIdsRef.current.add(group.sessionId);
          if (!group.isClosed) next.add(group.sessionId);
        }

        const hasUnseenNewOrder = group.orders.some(
          (order) => newOrderIds.has(order.id) && !expandedNewOrderIdsRef.current.has(order.id),
        );
        if (hasUnseenNewOrder) next.add(group.sessionId);
        group.orders.forEach((order) => {
          if (newOrderIds.has(order.id)) expandedNewOrderIdsRef.current.add(order.id);
        });
      });
      return next;
    });
  }, [groupedOrders, newOrderIds]);

  const activeOrders = statusCounts.pending + statusCounts.preparing + statusCounts.served;
  const paidTotal = Number(stats.paid_total);

  return (
    <AdminSection title="订单管理" onRefresh={load}>
      {/* ─ 结账提醒 ─ */}
      {billRequests.length ? (
        <section className="bill-alerts-new">
          {billRequests.map((request) => (
            <div className="bill-alert-item" key={request.id}>
              <span>
                {request.payment_method === 'pos' ? <CreditCard size={18} /> : <Banknote size={18} />}
                <strong>{request.table_number} 号桌</strong> 请求结账 · {request.payment_method === 'pos' ? 'POS' : '现金'}
              </span>
              <button className="primary-button" type="button" disabled={confirmingBillIds.has(request.id)} onClick={() => confirmBillPayment(request)}>
                {confirmingBillIds.has(request.id) ? '处理中…' : '确认收款并清桌'}
              </button>
            </div>
          ))}
        </section>
      ) : null}

      {/* ─ 筛选卡片 ─ */}
      <div className="order-filter-card">
        <div className="order-filter-row">
          {(Object.keys(statusLabels) as OrderStatus[]).filter((s) => s !== 'preparing' && s !== 'served').map((status) => (
            <button key={status} className={`filter-chip${statusFilter === status ? ' active' : ''}`} onClick={() => setStatusFilter(statusFilter === status ? 'all' : status)}>
              {statusLabels[status]} {statusCounts[status]}
            </button>
          ))}
          <button className={`filter-chip${statusFilter === 'all' ? ' active' : ''}`} onClick={() => setStatusFilter('all')}>全部 {stats.total_orders}</button>
        </div>
        <div className="order-filter-row">
          <label className="filter-label">
            日期
            <select value={dateFilter} onChange={(e) => setDateFilter(e.target.value as typeof dateFilter)}>
              <option value="today">今日</option>
              <option value="yesterday">昨日</option>
              <option value="7days">近7天</option>
              <option value="all">全部</option>
              <option value="custom">指定日期</option>
            </select>
          </label>
          {dateFilter === 'custom' ? <input value={customDate} type="date" onChange={(e) => setCustomDate(e.target.value)} className="filter-input" /> : null}
          <label className="filter-label">
            桌号
            <select value={tableFilter} onChange={(e) => setTableFilter(e.target.value)}>
              <option value="all">全部</option>
              {tableOptions.map((n) => <option value={n} key={n}>{n} 号桌</option>)}
            </select>
          </label>
          <input type="number" min="1" placeholder="跳转桌号" className="filter-input" style={{ width: '90px' }} onKeyDown={(e) => { if (e.key === 'Enter') { const v = (e.target as HTMLInputElement).value; setTableFilter(v || 'all'); } }} />
          <input className="filter-input" placeholder="搜索桌号/订单号/菜名…" style={{ flex: 1 }} value={orderSearch} onChange={(e) => setOrderSearch(e.target.value)} />
        </div>
      </div>

      {/* ─ 统计卡片 ─ */}
      <div className="order-stats-row">
        <div className="stat-card">
          <span>今日订单</span>
          <strong>{stats.total_orders}</strong>
        </div>
        <div className="stat-card accent-red">
          <span>待处理</span>
          <strong>{statusCounts.pending}</strong>
        </div>
        <div className="stat-card accent-green">
          <span>今日营业额</span>
          <strong>{formatPrice(Number(stats.paid_total))}</strong>
        </div>
        <div className="stat-card accent-gray">
          <span>已取消</span>
          <strong>{statusCounts.cancelled}</strong>
        </div>
        <div className="stat-card tool-card">
          <span>提醒设置</span>
          <label className="tool-row">
            <input checked={autoPrintEnabled} type="checkbox" onChange={toggleAutoPrint} />
            自动打印
          </label>
          <label className="tool-row">
            <input checked={soundEnabled} type="checkbox" onChange={() => { const n = !soundEnabled; onSoundEnabledChange(n); if (n) playOrderNotification(); toast(n ? '声音提醒已开启' : '声音提醒已关闭'); }} />
            {soundEnabled ? '🔔 有声' : '🔕 静音'}
          </label>
          <label className="tool-row">
            纸宽
            <select value={paperWidth} onChange={(e) => { const v = e.target.value; setPaperWidth(v); try { localStorage.setItem('restaurant_ticket_paper_width', v); } catch { /* noop */ } }}>
              <option value="80">80mm</option>
              <option value="58">58mm</option>
            </select>
          </label>
        </div>
      </div>
      {printWarning ? <p className="print-warning-banner">⚠ {printWarning}<button type="button" onClick={() => setPrintWarning(null)} className="print-warning-dismiss">×</button></p> : null}

      {/* ─ 批量操作 ─ */}
        <div className="bulk-action-bar">
          <label className="checkbox-label">
            <input type="checkbox" checked={filteredOrders.length > 0 && filteredOrders.every((o) => selectedOrderIds.has(o.id))} onChange={(e) => { if (e.target.checked) setSelectedOrderIds(new Set(filteredOrders.map((o) => o.id))); else setSelectedOrderIds(new Set()); }} />
            全选
          </label>
          <strong>已选 {selectedOrderIds.size} 张</strong>
          <button className="danger-inline" type="button" disabled={selectedOrderIds.size === 0} onClick={() => promptDeleteOrders(Array.from(selectedOrderIds), `批量删除 ${selectedOrderIds.size} 张订单`)}><Trash2 size={14} /> 批量删除</button>
          {selectedOrderIds.size > 0 ? <button className="secondary-button" type="button" onClick={() => setSelectedOrderIds(new Set())}>取消</button> : null}
        </div>

      {/* ─ 订单列表 ─ */}
      <div className="order-list-new">
        {groupedOrders.length === 0 ? (
          <div className="admin-empty-state"><BarChart3 size={32} /><strong>暂无订单</strong></div>
        ) : groupedOrders.map((group) => (
          <article className={`order-card-new${group.isClosed ? ' closed' : ''}`} key={group.sessionId}>
            {group.orders.map((order) => {
              const s = order.status;
              const isPaid = order.payment_status === 'paid';
              const borderColor = isPaid ? '#16a34a' : s === 'cancelled' ? '#9ca3af' : s === 'pending' ? '#f59e0b' : '#6b7280';
              return (
                <div className={`order-card-row status-${s}`} key={order.id} style={{ borderLeftColor: borderColor }}>
                  <div className="ocr-left">
                    <span className="ocr-table">
                      {order.order_type === 'takeaway' ? '外带'
                        : group.tableNumber ? `${group.tableNumber} 号桌`
                        : '堂食'}
                    </span>
                    <span className="ocr-number">#{order.order_number}</span>
                    <span className="ocr-time">{new Date(order.created_at).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                    <span className="ocr-status" style={{ background: isPaid ? (order.payment_method === 'cash' ? '#16a34a' : '#2563eb') : s === 'cancelled' ? '#9ca3af' : '#f59e0b' }}>
                      {isPaid ? (order.payment_method === 'cash' ? '已收款 · 现金' : order.payment_method === 'pos' ? '已收款 · 刷卡' : '已收款') : s === 'cancelled' ? '已取消' : '未付款'}
                    </span>
                    <span className="ocr-status-sub">{statusLabels[s]}</span>
                  </div>
                  <div className="ocr-items">
                    {(order.order_items ?? []).map((item) => (
                      <div key={item.id} className="ocr-item">
                        <b>×{item.quantity}</b> {item.item_name_zh || item.item_name_en || item.item_name_el}
                        {item.note ? <small> · {item.note}</small> : null}
                        {item.selected_options && item.selected_options.length > 0 ? (
                          <small className="ocr-options">
                            {item.selected_options.map((opt) => opt.choice_name_zh || opt.choice_name_en || opt.choice_name_el).join('、')}
                          </small>
                        ) : null}
                      </div>
                    ))}
                  </div>
                  <div className="ocr-right">
                    <strong className="ocr-price">{formatPrice(Number(order.total_price))}</strong>
                    <div className="ocr-actions">
                      {s === 'pending' ? <button className="mini-btn primary" onClick={() => changeStatus(order.id, 'preparing')}>接单</button> : null}
                      {!isPaid ? (
                        <button className="mini-btn" style={{ background: '#fef3c7', borderColor: '#f59e0b', color: '#92400e' }}
                          onClick={() => setPayOrder(order)}>收款</button>
                      ) : null}
                      <button className="mini-btn" onClick={() => previewKitchenTicket(order)}>预览</button>
                      <button className="mini-btn" onClick={() => printKitchenTicket(order)}><Printer size={13} />打印</button>
                      <button className="mini-btn danger-text" onClick={() => changeStatus(order.id, 'cancelled')}>取消</button>
                      <button className="mini-btn danger-text" onClick={() => promptDeleteOrders([order.id], `删除订单 #${order.order_number}`)}><Trash2 size={13} /></button>
                    </div>
                  </div>
                </div>
              );
            })}
          </article>
        ))}
      </div>

      {/* ─ 分页 ─ */}
      {totalPages > 1 ? (
        <nav className="order-pagination">
          <button className="secondary-button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>上一页</button>
          <span>{page} / {totalPages} · {totalSessions} 个会话</span>
          <button className="secondary-button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>下一页</button>
        </nav>
      ) : null}

      {/* ─ 打印确认弹窗 ─ */}
      {printConfirmOrder ? (
        <div className="print-confirm-overlay" onClick={() => setPrintConfirmOrder(null)}>
          <div className="print-confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <h2>确认打印厨房小票</h2>
            <div className="print-confirm-meta">
              <span>订单 <strong>#{printConfirmOrder.order_number}</strong></span>
              <span>桌号 <strong>{printConfirmOrder.restaurant_tables?.table_number ?? '—'}</strong></span>
              {printConfirmOrder.kitchen_printed_at ? <span className="print-confirm-warning">⚠ 重打</span> : null}
            </div>
            <div className="print-confirm-items">
              {printConfirmOrder.order_items?.map((item, i) => (
                <div key={i} className="print-confirm-item"><strong>{item.quantity} × {item.item_name_zh || item.item_name_en || item.item_name_el}</strong>{item.selected_options && item.selected_options.length > 0 ? <small> · {item.selected_options.map((o: any) => o.choice_name_zh || o.choice_name_en || o.choice_name_el).join('、')}</small> : null}{item.note ? <small>备注：{item.note}</small> : null}</div>
              ))}
            </div>
            <div className="print-confirm-actions">
              <button className="secondary-button" onClick={() => setPrintConfirmOrder(null)}>取消</button>
              <button className="primary-button" onClick={() => { const o = printConfirmOrder; setPrintConfirmOrder(null); void doPrintKitchenTicket(o); }}><Printer size={16} />确认打印</button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ─ 确认收款弹窗 ─ */}
      {payOrder ? (
        <div className="print-confirm-overlay" onClick={() => { if (!paying) setPayOrder(null); }}>
          <div className="print-confirm-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 380 }}>
            <h2>确认收款</h2>
            <p style={{ margin: '8px 0' }}>
              订单 <strong>#{payOrder.order_number}</strong>
              {payOrder.restaurant_tables?.table_number ? ` · ${payOrder.restaurant_tables.table_number} 号桌` : ''}
            </p>
            <p style={{ fontSize: 13, color: '#6b7280', margin: '8px 0' }}>
              {payOrder.session_id
                ? '确认后将收款并清桌，同一桌所有未付款订单将被标记为已付款，旧顾客将不能继续点餐。'
                : '该订单无桌台会话，只会标记为已收款。'}
            </p>
            <div className="print-confirm-actions" style={{ marginTop: 16 }}>
              <button className="secondary-button" type="button" disabled={paying} onClick={() => setPayOrder(null)}>取消</button>
              <button className="primary-button" type="button" disabled={paying} onClick={() => confirmPayment('cash')}>现金</button>
              <button className="mini-btn primary" type="button" disabled={paying} onClick={() => confirmPayment('pos')}>刷卡</button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ─ 删除确认弹窗 ─ */}
      {deleteDialogOpen && deleteTarget ? (
        <div className="print-confirm-overlay" onClick={() => { if (!deleting) { setDeleteDialogOpen(false); setDeleteTarget(null); } }}>
          <div className="print-confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <h2>删除订单验证</h2>
            <p className="dialog-warning-text">⚠ 此操作将<strong>永久删除</strong>{deleteTarget.ids.length} 张订单及关联数据，不可恢复。</p>
            <div className="print-confirm-meta"><span>{deleteTarget.label}</span></div>
            <div className="dialog-password-wrap">
              <label className="dialog-password-label">请输入删除密码</label>
              <input type="password" className="text-field" value={deletePassword} onChange={(e) => { setDeletePassword(e.target.value); setDeleteError(null); }} placeholder="输入删除密码" autoFocus disabled={deleting} onKeyDown={(e) => { if (e.key === 'Enter' && !deleting) void executeDeleteOrders(); }} />
            </div>
            {deleteError ? <p className="dialog-error-text">{deleteError}</p> : null}
            <div className="print-confirm-actions">
              <button className="secondary-button" onClick={() => { setDeleteDialogOpen(false); setDeleteTarget(null); }} disabled={deleting}>取消</button>
              <button className={deleting ? 'primary-button' : 'primary-button dialog-danger-button'} onClick={() => void executeDeleteOrders()} disabled={deleting}><Trash2 size={16} />{deleting ? '删除中…' : '确认永久删除'}</button>
            </div>
          </div>
        </div>
      ) : null}
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

function buildKitchenTicket(
  order: Order,
  isReprint: boolean,
  printedAt: string,
  restaurantName?: string,
  isAdditional?: boolean,
  paperWidth = '80',
) {
  const is58 = paperWidth === '58';
  const tableNumber = order.restaurant_tables?.table_number ?? null;
  const tableLabel = order.order_type === 'takeaway' ? '外带'
    : tableNumber ? `${tableNumber} 号桌`
    : '堂食';
  const totalPrice = formatPrice(Number(order.total_price));
  const itemRows = (order.order_items ?? [])
    .map((item) => {
      const optsText = item.selected_options && (item.selected_options as any[]).length > 0
        ? (item.selected_options as any[]).map((o: any) => o.choice_name_zh || o.choice_name_en || o.choice_name_el).join('、')
        : '';
      return `
        <div class="item">
          <div class="item-head">
            <strong>${escapeTicketText(item.quantity)} × ${escapeTicketText(item.item_name_zh || item.item_name_en || item.item_name_el)}</strong>
          </div>
          ${optsText ? `<div class="item-opts">${escapeTicketText(optsText)}</div>` : ''}
          ${item.note ? `<div class="item-note">备注：${escapeTicketText(item.note)}</div>` : ''}
        </div>`;
    })
    .join('');

  return `<!doctype html>
    <html lang="zh-CN">
      <head>
        <meta charset="utf-8" />
        <title>厨房小票 #${escapeTicketText(order.order_number)}</title>
        <style>
          @page { size: ${paperWidth}mm auto; margin: ${is58 ? '3mm' : '5mm'}; }
          body { color: #000; font-family: Arial, "Microsoft YaHei", sans-serif; margin: 0; width: ${is58 ? '50mm' : '70mm'}; }
          h1 { border-bottom: 2px dashed #000; font-size: ${is58 ? '18px' : '22px'}; margin: 0 0 8px; padding-bottom: 8px; text-align: center; }
          .restaurant { font-size: ${is58 ? '12px' : '14px'}; font-weight: 700; margin-bottom: 2px; text-align: center; }
          .reprint { border: 3px solid #000; font-size: ${is58 ? '16px' : '20px'}; font-weight: 900; margin-bottom: 8px; padding: 5px; text-align: center; }
          .additional { border: 2px solid #000; font-size: ${is58 ? '13px' : '16px'}; font-weight: 900; margin-bottom: 8px; padding: 4px; text-align: center; }
          .meta { border-bottom: 1px dashed #000; display: grid; gap: 4px; font-size: ${is58 ? '13px' : '16px'}; padding-bottom: 8px; }
          .item { border-bottom: 1px dashed #777; padding: ${is58 ? '6px 0' : '10px 0'}; }
          .item-head { font-size: ${is58 ? '16px' : '18px'}; font-weight: 700; }
          .item-opts { color: #444; font-size: ${is58 ? '13px' : '15px'}; margin-top: 2px; }
          .item-note { color: #666; font-size: ${is58 ? '12px' : '14px'}; margin-top: 1px; }
          .total { border-top: 2px solid #000; font-size: ${is58 ? '17px' : '20px'}; font-weight: 900; margin-top: 8px; padding-top: 8px; text-align: right; }
          footer { font-size: ${is58 ? '10px' : '11px'}; margin-top: 12px; text-align: center; }
        </style>
      </head>
      <body>
        ${isReprint ? '<div class="reprint">重打 / Reprint</div>' : ''}
        ${isAdditional ? '<div class="additional">加餐 / Additional</div>' : ''}
        ${restaurantName ? `<div class="restaurant">${escapeTicketText(restaurantName)}</div>` : ''}
        <h1>${escapeTicketText(tableLabel)}</h1>
        <div class="meta">
          <strong>订单 #${escapeTicketText(order.order_number)}</strong>
          <span>下单：${escapeTicketText(new Date(order.created_at).toLocaleString('zh-CN'))}</span>
          <span>打印：${escapeTicketText(new Date(printedAt).toLocaleString('zh-CN'))}</span>
        </div>
        ${itemRows}
        <div class="total">合计 ${escapeTicketText(totalPrice)}</div>
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

function localDayBounds(value: Date) {
  const from = new Date(value.getFullYear(), value.getMonth(), value.getDate());
  const to = new Date(value.getFullYear(), value.getMonth(), value.getDate() + 1);
  return { from: from.toISOString(), to: to.toISOString() };
}

function orderDateBounds(filter: 'today' | 'yesterday' | '7days' | 'all' | 'custom', customDate: string) {
  if (filter === 'all') return { from: null, to: null };
  if (filter === 'custom') return localDayBounds(new Date(`${customDate}T00:00:00`));
  if (filter === 'yesterday') {
    const d = new Date(); d.setDate(d.getDate() - 1);
    return localDayBounds(d);
  }
  if (filter === '7days') {
    const to = new Date();
    const from = new Date(); from.setDate(from.getDate() - 6);
    from.setHours(0, 0, 0, 0);
    to.setHours(23, 59, 59, 999);
    return { from: from.toISOString(), to: to.toISOString() };
  }
  return localDayBounds(new Date());
}

function dateToKey(value: string) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

import { playOrderNotification } from '../lib/audio';

function TableManager({ onMessage, toast, syncVersion }: { onMessage: (value: string | null) => void; toast: (msg: string, type?: 'success' | 'error' | 'warning') => void; syncVersion: number }) {
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [sessions, setSessions] = useState<TableSession[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [reentryRequests, setReentryRequests] = useState<TableReentryRequest[]>([]);
  const [newNumber, setNewNumber] = useState(1);
  const [newLabel, setNewLabel] = useState('');
  const [restaurantName, setRestaurantName] = useState('餐馆');

  useEffect(() => {
    void load();
  }, [syncVersion]);

  async function load() {
    try {
      const [tableRows, sessionRows, orderRows, reentryRows, settings] = await Promise.all([
        fetchRestaurantTables(),
        fetchActiveSessions(),
        fetchAdminOrders(),
        fetchPendingTableReentryRequests(),
        getRestaurantSettings(),
      ]);
      setTables(tableRows);
      setSessions(sessionRows);
      setOrders(orderRows);
      setReentryRequests(reentryRows);
      setRestaurantName(settings?.name_zh || settings?.name_en || settings?.name_el || '餐馆');
    } catch (err) {
      onMessage(formatUnknownError(err));
    }
  }

  async function addTable() {
    try {
      await createRestaurantTable(newNumber, newLabel || `Table ${newNumber}`);
      toast('桌台已创建');
      setNewNumber(newNumber + 1);
      setNewLabel('');
      load();
    } catch (err) {
      onMessage(formatUnknownError(err));
    }
  }

  async function saveTable(table: RestaurantTable) {
    try {
      await saveRestaurantTable(table);
      toast('桌台已保存');
      load();
    } catch (err) {
      onMessage(formatUnknownError(err));
    }
  }

  async function regenerate(tableId: string) {
    const confirmed = window.confirm(
      '重生成后，旧二维码将立即作废，已打印贴在桌上的二维码需要重新打印和更换。确定继续吗？',
    );
    if (!confirmed) return;

    try {
      await regenerateTableQrToken(tableId);
      toast('二维码 token 已重新生成');
      load();
    } catch (err) {
      onMessage(formatUnknownError(err));
    }
  }

  async function closeSession(session: TableSession) {
    const openCount = orders.filter(
      (order) =>
        order.session_id === session.id &&
        ['pending', 'preparing', 'served'].includes(order.status),
    ).length;
    if (openCount > 0) {
      onMessage(`该桌还有 ${openCount} 张未完成订单，请先完成或取消这些订单。`);
      return;
    }
    if (session.bill_request_status === 'requested') {
      onMessage('该桌正在等待付款，请先确认收款。');
      return;
    }
    if (!window.confirm('确认清空该桌未提交购物车并结束本次用餐吗？')) {
      return;
    }

    try {
      const result = await closeTableSession(session.id);
      toast(`已清桌，删除未提交购物车 ${result.deleted_cart_count} 条。`);
      load();
    } catch (err) {
      onMessage(formatUnknownError(err));
    }
  }

  async function approveReentry(request: TableReentryRequest) {
    try {
      const result = await approveTableReentry(request.id);
      toast(result.request_status === 'approved' ? '已批准该设备重新开桌。' : '目标会话已结束，请顾客重新发起请求。');
      await load();
    } catch (err) {
      onMessage(formatUnknownError(err));
    }
  }

  async function rejectReentry(request: TableReentryRequest) {
    try {
      await rejectTableReentry(request.id);
      toast('已拒绝该设备的重新开桌请求。');
      await load();
    } catch (err) {
      onMessage(formatUnknownError(err));
    }
  }

  const sessionByTable = useMemo(() => new Map(sessions.map((session) => [session.table_id, session])), [sessions]);

  const tableStats = useMemo(() => ({
    total: tables.length,
    enabled: tables.filter((t) => t.is_active).length,
    inUse: sessions.filter((s) => (s.participant_count ?? 0) > 0).length,
    idle: tables.filter((t) => t.is_active).length - sessions.filter((s) => (s.participant_count ?? 0) > 0).length,
  }), [tables, sessions]);

  return (
    <AdminSection title="桌台管理" subtitle="管理桌号、二维码、点餐链接和清桌状态" onRefresh={load}>
      {/* stats */}
      <div className="item-stats-row">
        <div className="istat"><span>桌台总数</span><strong>{tableStats.total}</strong></div>
        <div className="istat istat-green"><span>启用桌台</span><strong>{tableStats.enabled}</strong></div>
        <div className="istat istat-blue"><span>使用中</span><strong>{tableStats.inUse}</strong></div>
        <div className="istat istat-gray"><span>空闲</span><strong>{Math.max(0, tableStats.idle)}</strong></div>
      </div>

      {/* new table */}
      <div className="item-toolbar" style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '12px 14px', marginBottom: '14px' }}>
        <TextField label="桌号" value={newNumber} type="number" onChange={(v) => setNewNumber(Number(v))} />
        <TextField label="备注" value={newLabel} onChange={setNewLabel} />
        <button className="primary-button" type="button" onClick={addTable}><Plus size={15} />新增桌台</button>
      </div>

      <div className="table-admin-grid">
        {tables.map((table) => (
          <TableCard
            key={table.id}
            table={table}
            session={sessionByTable.get(table.id) ?? null}
            sessionOrders={orders.filter((order) => order.session_id === sessionByTable.get(table.id)?.id)}
            reentryRequests={reentryRequests.filter((request) => request.table_id === table.id)}
            restaurantName={restaurantName}
            onSave={saveTable}
            onRegenerate={regenerate}
            onClose={closeSession}
            onApproveReentry={approveReentry}
            onRejectReentry={rejectReentry}
            toast={toast}
          />
        ))}
      </div>
    </AdminSection>
  );
}

function TableCard({
  table, session, sessionOrders, reentryRequests, restaurantName,
  onSave, onRegenerate, onClose, onApproveReentry, onRejectReentry, toast,
}: {
  table: RestaurantTable; session: TableSession | null; sessionOrders: Order[]; reentryRequests: TableReentryRequest[]; restaurantName: string;
  onSave: (table: RestaurantTable) => void; onRegenerate: (tableId: string) => void; onClose: (session: TableSession) => void;
  onApproveReentry: (request: TableReentryRequest) => void; onRejectReentry: (request: TableReentryRequest) => void;
  toast: (msg: string, type?: 'success' | 'error' | 'warning') => void;
}) {
  const [value, setValue] = useState<RestaurantTable>(table);
  const qrRef = useRef<HTMLDivElement | null>(null);
  const tableLabel = table.label || `Table ${table.table_number}`;
  const qrUrl = `${publicSiteUrl}/table/${table.qr_token}`;
  const occupied = Boolean(session && (session.participant_count ?? 0) > 0);
  const openOrderCount = sessionOrders.filter((order) => ['pending', 'preparing', 'served'].includes(order.status)).length;
  const paymentRequested = occupied && session?.bill_request_status === 'requested';
  const paidPendingClear = occupied && !paymentRequested && openOrderCount === 0 && sessionOrders.some((order) => order.status === 'paid');
  const occupancyLabel = paymentRequested
    ? '待付款'
    : paidPendingClear
      ? '已付款 / 待清桌'
      : occupied
        ? '使用中'
        : '待客 / 空闲';
  const occupancyDetail = paymentRequested
    ? `${session?.participant_count ?? 0} 台设备已加入，等待确认收款`
    : paidPendingClear
      ? '订单已付款，请清桌结束本次用餐'
      : occupied
        ? `${session?.participant_count ?? 0} 台设备已加入，${openOrderCount} 张未完成订单`
        : '已有可用会话，等待新顾客扫码';

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
      ctx.fillText(restaurantName, width / 2, 170);
      ctx.drawImage(image, 150, 230, 600, 600);
      ctx.fillStyle = '#555555';
      ctx.font = '400 24px Arial, sans-serif';
      wrapCanvasText(ctx, qrUrl, width / 2, 900, 760, 32);

      const link = document.createElement('a');
      link.download = `restaurant-${tableLabel.toLowerCase().replace(/\s+/g, '-')}-qr.png`;
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
        <QRCodeSVG value={qrUrl} size={150} />
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
        <p className="qr-url" title={qrUrl}>{qrUrl}</p>
        <span className={`availability-badge${occupancyLabel === '待付款' ? '' : occupancyLabel === '使用中' ? '' : occupancyLabel === '已付款 / 待清桌' ? '' : ' active'}`} style={{
          background: occupancyLabel === '待付款' ? '#fef3c7' : occupancyLabel === '使用中' ? '#dbeafe' : occupancyLabel === '已付款 / 待清桌' ? '#dcfce7' : undefined,
          color: occupancyLabel === '待付款' ? '#92400e' : occupancyLabel === '使用中' ? '#1e40af' : occupancyLabel === '已付款 / 待清桌' ? '#166534' : undefined,
        }}>{occupancyLabel}</span>
        <div className={`table-occupancy-status ${paymentRequested ? 'is-payment' : occupied ? 'is-occupied' : 'is-ready'}`}>
          <span>{occupancyDetail}</span>
        </div>
        {reentryRequests.length ? (
          <div className="table-reentry-admin">
            <strong>加入桌台请求</strong>
            {reentryRequests.map((request) => (
              <div key={request.id}>
                <span>{new Date(request.requested_at).toLocaleString('zh-CN')}</span>
                <button className="primary-button" type="button" onClick={() => onApproveReentry(request)}>批准</button>
                <button className="secondary-button" type="button" onClick={() => onRejectReentry(request)}>拒绝</button>
              </div>
            ))}
          </div>
        ) : null}
        <div className="table-primary-action">
          <button
            className="clear-table-button"
            type="button"
            disabled={!occupied || paymentRequested || openOrderCount > 0}
            onClick={() => occupied && session && onClose(session)}
          >
            清桌
          </button>
        </div>
        <div className="table-maintenance-actions">
          <button className="maintenance-button" type="button" onClick={() => { navigator.clipboard.writeText(qrUrl).then(() => toast('链接已复制')).catch(() => toast('复制失败','error')); }}>
            <Copy size={13} />
            复制链接
          </button>
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
          {occupied ? '当前有顾客设备加入，交接桌台时请使用清桌。' : '当前待客。二维码保持不变，新顾客扫码会加入当前会话。'}
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

function SystemSettings({
  realtimeStatus,
  adminRole,
}: {
  realtimeStatus: RealtimeConnectionStatus;
  adminRole: 'admin' | 'staff' | null;
}) {
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
      <SystemHealthSection realtimeStatus={realtimeStatus} />
      {adminRole === 'admin' ? (
        <DataBackupSection />
      ) : (
        <AdminSection title="数据备份">
          <div className="admin-panel-card">
            <Database size={24} />
            <div>
              <h2>仅限管理员</h2>
              <p>数据备份导出功能仅对管理员账户开放。如需备份，请联系管理员操作。</p>
            </div>
          </div>
        </AdminSection>
      )}
    </AdminSection>
  );
}

function SystemHealthSection({
  realtimeStatus,
}: {
  realtimeStatus: RealtimeConnectionStatus;
}) {
  const [health, setHealth] = useState<{
    status: string;
    timestamp: string;
    version: string;
    checks: Record<string, string>;
    error?: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkError, setCheckError] = useState<string | null>(null);

  const checkHealth = async () => {
    setLoading(true);
    setCheckError(null);
    try {
      const res = await fetch('/api/health');
      const json = await res.json();
      setHealth(json);
    } catch (err) {
      setCheckError(formatUnknownError(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkHealth();
  }, []);

  const dbOk = health?.checks?.database === 'connected';
  const configOk = health?.checks?.config === 'readable';
  const rtOk = realtimeStatus === 'connected';
  const overallOk = health?.status === 'ok' && rtOk;

  return (
    <AdminSection title="系统状态" onRefresh={checkHealth}>
      <div className="health-status-grid">
        <div className={`health-check-card ${overallOk ? 'is-ok' : 'is-error'}`}>
          <Activity size={20} />
          <div>
            <strong>系统状态</strong>
            <span>{loading ? '检查中…' : overallOk ? '运行正常' : '需要关注'}</span>
          </div>
        </div>
        <div className={`health-check-card ${dbOk ? 'is-ok' : 'is-error'}`}>
          <Database size={20} />
          <div>
            <strong>数据库连接</strong>
            <span>{loading ? '检查中…' : dbOk ? '已连接' : '未连接'}</span>
          </div>
        </div>
        <div className={`health-check-card ${configOk ? 'is-ok' : 'is-error'}`}>
          <Settings2 size={20} />
          <div>
            <strong>基础配置</strong>
            <span>{loading ? '检查中…' : configOk ? '可读取' : '不可用'}</span>
          </div>
        </div>
        <div className={`health-check-card ${rtOk ? 'is-ok' : 'is-error'}`}>
          {rtOk ? <Wifi size={20} /> : <WifiOff size={20} />}
          <div>
            <strong>Realtime</strong>
            <span>{rtOk ? '已连接' : realtimeStatus === 'connecting' ? '连接中…' : '已断开'}</span>
          </div>
        </div>
      </div>
      {health ? (
        <div className="health-meta">
          <span>
            <Clock3 size={14} /> 最近检查: {new Date(health.timestamp).toLocaleString('zh-CN')}
          </span>
          <span>版本: {health.version}</span>
        </div>
      ) : null}
      {checkError ? (
        <p className="admin-message admin-message-danger">
          健康检查失败: {checkError}
        </p>
      ) : null}
      {health?.error ? (
        <p className="admin-message admin-message-danger">
          {health.error}
        </p>
      ) : null}
    </AdminSection>
  );
}

function DataBackupSection() {
  const TABLE_OPTIONS: { key: string; label: string }[] = [
    { key: 'restaurant_settings', label: '餐馆设置' },
    { key: 'menu_categories', label: '菜单分类' },
    { key: 'menu_items', label: '菜品' },
    { key: 'restaurant_tables', label: '桌台' },
    { key: 'orders', label: '订单' },
    { key: 'order_items', label: '订单明细' },
    { key: 'bill_requests', label: '付款记录' },
  ];

  const [selected, setSelected] = useState<Set<string>>(
    new Set(TABLE_OPTIONS.map((t) => t.key)),
  );
  const [format, setFormat] = useState<'csv' | 'json'>('json');
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const toggleTable = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(TABLE_OPTIONS.map((t) => t.key)));
  const clearAll = () => setSelected(new Set());

  const handleExport = async () => {
    if (!supabase) {
      setMessage({ type: 'error', text: 'Supabase 客户端未初始化' });
      return;
    }
    if (selected.size === 0) {
      setMessage({ type: 'error', text: '请至少选择一张表' });
      return;
    }

    setExporting(true);
    setMessage(null);

    try {
      const { data, errors } = await fetchAllTableData(supabase, {
        dateFrom: dateFrom ? `${dateFrom}T00:00:00` : undefined,
        dateTo: dateTo ? `${dateTo}T23:59:59` : undefined,
      });

      const errorKeys = Object.keys(errors);
      if (errorKeys.length > 0) {
        const msg = errorKeys
          .map((k) => `${k}: ${errors[k]}`)
          .join('; ');
        setMessage({ type: 'error', text: `部分表读取失败: ${msg}` });
      }

      if (format === 'json') {
        const exportData: Record<string, unknown[]> = {};
        for (const key of selected) {
          if (data[key]) exportData[key] = data[key];
        }
        if (Object.keys(exportData).length === 0) {
          setMessage({ type: 'error', text: '没有可导出的数据' });
        } else {
          downloadFile(
            exportRowsToJSON(exportData as unknown as Record<string, unknown>[]),
            generateBackupFilename('json'),
            'application/json',
          );
          setMessage({ type: 'success', text: 'JSON 备份文件已下载' });
        }
      } else {
        let downloaded = 0;
        for (const key of selected) {
          if (!data[key] || data[key].length === 0) continue;
          const columns = Object.keys(data[key][0]);
          downloadFile(
            exportRowsToCSV(data[key], columns),
            `${key}-${generateBackupFilename('csv')}`,
            'text/csv;charset=utf-8',
          );
          downloaded++;
        }
        if (downloaded === 0) {
          setMessage({ type: 'error', text: '没有可导出的数据' });
        } else {
          setMessage({
            type: 'success',
            text: `${downloaded} 个 CSV 文件已下载`,
          });
        }
      }
    } catch (err) {
      setMessage({
        type: 'error',
        text: formatUnknownError(err),
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <AdminSection title="数据备份">
      <div className="admin-panel-card">
        <Download size={24} />
        <div>
          <h2>手动备份导出</h2>
          <p>选择要导出的数据表，下载 CSV 或 JSON 格式的备份文件。此操作为只读，不影响生产数据。</p>
        </div>
      </div>
      <div className="backup-control-panel">
        <div className="backup-table-checklist">
          <div className="backup-checklist-header">
            <strong>选择数据表</strong>
            <div className="backup-checklist-actions">
              <button className="secondary-button" type="button" onClick={selectAll}>
                全选
              </button>
              <button className="secondary-button" type="button" onClick={clearAll}>
                取消全选
              </button>
            </div>
          </div>
          {TABLE_OPTIONS.map((t) => (
            <label key={t.key} className="backup-checklist-item">
              <input
                type="checkbox"
                checked={selected.has(t.key)}
                onChange={() => toggleTable(t.key)}
              />
              <span>{t.label}</span>
              <code>{t.key}</code>
            </label>
          ))}
        </div>
        <div className="backup-date-range">
          <strong>时间范围（可选，仅对订单/付款记录生效）</strong>
          <div className="backup-date-inputs">
            <label>
              <span>开始日期</span>
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </label>
            <label>
              <span>结束日期</span>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </label>
            {dateFrom || dateTo ? (
              <button className="secondary-button" type="button" onClick={() => { setDateFrom(''); setDateTo(''); }}>
                清除
              </button>
            ) : null}
          </div>
        </div>
        <div className="backup-format-selector">
          <strong>导出格式</strong>
          <div className="backup-format-buttons">
            <button
              className={format === 'json' ? 'primary-button' : 'secondary-button'}
              type="button"
              onClick={() => setFormat('json')}
            >
              JSON
            </button>
            <button
              className={format === 'csv' ? 'primary-button' : 'secondary-button'}
              type="button"
              onClick={() => setFormat('csv')}
            >
              CSV
            </button>
          </div>
        </div>
        <div className="backup-actions">
          <button
            className="primary-button"
            type="button"
            onClick={handleExport}
            disabled={exporting || selected.size === 0}
          >
            <Download size={16} />
            {exporting ? '导出中…' : '导出数据'}
          </button>
          {message ? (
            <span
              className="backup-message"
              data-type={message.type}
            >
              {message.text}
            </span>
          ) : null}
        </div>
      </div>
    </AdminSection>
  );
}

function AdminSection({
  title,
  subtitle,
  children,
  onRefresh,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onRefresh?: () => void;
}) {
  return (
    <section>
      <div className="admin-section-header">
        <div>
          <h1>{title}</h1>
          {subtitle ? <p className="admin-section-subtitle">{subtitle}</p> : null}
        </div>
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

function SettingsImageField({
  label, value, onChange, uploadType, toast,
}: {
  label: string; value?: string | null; onChange: (v: string) => void;
  uploadType: 'logo' | 'hero'; toast: (msg: string, type?: 'success' | 'error' | 'warning') => void;
}) {
  const [uploading, setUploading] = useState(false);
  const isLogo = uploadType === 'logo';
  return (
    <div className="item-image-field">
      <TextField label={label} value={value} onChange={onChange} />
      <label className="item-upload-btn"><Upload size={14} />{uploading ? '上传中…' : `上传${isLogo ? 'Logo' : '首页图'}`}
        <input type="file" accept="image/*" hidden disabled={uploading} onChange={async (e) => {
          const file = e.target.files?.[0]; if (!file) return;
          const err = validateImageFile(file); if (err) { toast(err, 'warning'); return; }
          setUploading(true);
          try { const url = await uploadRestaurantImage(file, uploadType); onChange(url); toast(isLogo ? 'Logo 上传成功' : '首页主图上传成功'); }
          catch { toast('上传失败，请重试', 'error'); }
          finally { setUploading(false); }
        }} />
      </label>
    </div>
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
    <label className="field-label">
      {label}
      <input className="field-input" value={value ?? ''} type={type} onChange={(event) => onChange(event.target.value)} />
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
  value, onChange, onToast,
}: {
  value: Partial<MenuCategory>;
  onChange: (value: Partial<MenuCategory>) => void;
  onToast?: (msg: string, type?: 'success' | 'error' | 'warning') => void;
}) {
  const [uploading, setUploading] = useState(false);
  return (
    <div className="admin-form-grid compact-grid">
      <TextField label="中文" value={value.name_zh} onChange={(v) => onChange({ ...value, name_zh: v })} />
      <TextField label="英文" value={value.name_en} onChange={(v) => onChange({ ...value, name_en: v })} />
      <TextField label="希腊语" value={value.name_el} onChange={(v) => onChange({ ...value, name_el: v })} />
      <div className="item-image-field">
        <TextField label="封面图 URL" value={value.image_url} onChange={(v) => onChange({ ...value, image_url: v })} />
        {value.image_url ? <img src={value.image_url} alt="" className="item-image-preview" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} /> : null}
        <label className="item-upload-btn"><Upload size={14} />{uploading ? '上传中…' : '上传图片'}
          <input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={async (e) => {
            const file = e.target.files?.[0]; if (!file) return;
            const err = validateImageFile(file); if (err) { onToast?.(err, 'warning'); return; }
            setUploading(true);
            try { const url = await uploadCategoryImage(file, value.id); onChange({ ...value, image_url: url }); onToast?.('图片上传成功'); }
            catch { onToast?.('图片上传失败', 'error'); }
            finally { setUploading(false); }
          }} />
        </label>
      </div>
      <TextField label="排序" value={value.sort_order} type="number" onChange={(v) => onChange({ ...value, sort_order: Number(v) })} />
      <label className="checkbox-label"><input checked={Boolean(value.is_active)} type="checkbox" onChange={(event) => onChange({ ...value, is_active: event.target.checked })} />启用</label>
    </div>
  );
}

function ItemRow({
  item, categories, selected, onSelect, onMessage, onSave, onDuplicate, onDelete, toast,
}: {
  item: MenuItem; categories: MenuCategory[]; selected: boolean;
  onSelect: (checked: boolean) => void; onMessage: (value: string | null) => void;
  onSave: (item: Partial<MenuItem>) => void; onDuplicate: (item: MenuItem) => void; onDelete: (item: MenuItem) => void;
  toast: (msg: string, type?: 'success' | 'error' | 'warning') => void;
}) {
  const [value, setValue] = useState<Partial<MenuItem>>(item);
  const [translating, setTranslating] = useState(false);
  const [editing, setEditing] = useState(false);
  const category = categories.find((entry) => entry.id === item.category_id);

  async function autoTranslate() {
    try {
      setTranslating(true);
      setValue(await translateSingleMenuValue(value));
      onMessage('自动翻译完成');
    } catch (err) {
      onMessage(formatUnknownError(err));
    } finally {
      setTranslating(false);
    }
  }

  return (
    <div className="admin-row">
      <div className="item-row-summary">
        <input aria-label="选择菜品" checked={selected} type="checkbox" onChange={(event) => onSelect(event.target.checked)} />
        <div className="item-summary-name">
          {item.image_url ? <img src={item.image_url} alt="" width="44" height="44" loading="lazy" /> : <span className="item-image-placeholder">龙</span>}
          <span>
            <strong>{item.name_zh || item.name_en || item.name_el || '未填写'}</strong>
            {item.name_en ? <small>{item.name_en}</small> : <small className="item-name-el">未填写英文名</small>}
            {item.name_el ? <small className="item-name-el">{item.name_el}</small> : null}
          </span>
        </div>
        <span>{category?.name_zh || category?.name_en || '未分类'}</span>
        <strong>{formatPrice(Number(item.price))}</strong>
        <span className={`availability-badge${item.is_sold_out ? ' sold-out' : item.is_available ? ' active' : ''}`}>
          {item.is_sold_out ? '售罄' : item.is_available ? '上架' : '下架'}
        </span>
        <div className="item-row-actions">
          <button type="button" onClick={() => setEditing((open) => !open)}><Pencil size={14} />编辑</button>
          <button type="button" onClick={() => onDuplicate(item)}><Copy size={14} />复制</button>
          <button className="danger-text" type="button" onClick={() => onDelete(item)}><Trash2 size={14} />删除</button>
        </div>
      </div>
      {editing ? (
        <div className="item-row-editor">
          <ItemForm value={value} categories={categories} onChange={setValue} onToast={toast} />
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

const OPTION_TEMPLATES: Record<string, MenuItemOptionGroup> = {
  spicy: {
    id: 'spicy', name_zh: '辣度', name_en: 'Spicy level', name_el: 'Επίπεδο καυτερού',
    type: 'single', required: true,
    choices: [
      { id: 'no', name_zh: '不辣', name_en: 'No spicy', name_el: 'Χωρίς καυτερό' },
      { id: 'mild', name_zh: '微辣', name_en: 'Mild spicy', name_el: 'Λίγο καυτερό' },
      { id: 'medium', name_zh: '中辣', name_en: 'Medium spicy', name_el: 'Μέτρια καυτερό' },
      { id: 'hot', name_zh: '大辣', name_en: 'Very spicy', name_el: 'Πολύ καυτερό' },
    ],
  },
  special: {
    id: 'special', name_zh: '特殊要求', name_en: 'Special request', name_el: 'Ειδικό αίτημα',
    type: 'multiple', required: false,
    choices: [
      { id: 'less_salt', name_zh: '少盐', name_en: 'Less salt', name_el: 'Λιγότερο αλάτι' },
      { id: 'no_onion', name_zh: '不要葱', name_en: 'No onion', name_el: 'Χωρίς κρεμμύδι' },
      { id: 'no_cilantro', name_zh: '不要香菜', name_en: 'No cilantro', name_el: 'Χωρίς κόλιανδρο' },
      { id: 'less_oil', name_zh: '少油', name_en: 'Less oil', name_el: 'Λιγότερο λάδι' },
    ],
  },
  temperature: {
    id: 'temperature', name_zh: '温度', name_en: 'Temperature', name_el: 'Θερμοκρασία',
    type: 'single', required: false,
    choices: [
      { id: 'iced', name_zh: '冰', name_en: 'Iced', name_el: 'Παγωμένο' },
      { id: 'room_temp', name_zh: '常温', name_en: 'Room temperature', name_el: 'Θερμοκρασία δωματίου' },
    ],
  },
};

function addOptionTemplate(current: MenuItemOptionGroup[], templateKey: string): MenuItemOptionGroup[] {
  const tmpl = OPTION_TEMPLATES[templateKey];
  if (!tmpl) return current;
  if (current.some((g) => g.id === tmpl.id)) return current; // 防止重复
  return [...current, JSON.parse(JSON.stringify(tmpl))];
}

function removeOptionGroup(current: MenuItemOptionGroup[], groupId: string): MenuItemOptionGroup[] {
  return current.filter((g) => g.id !== groupId);
}

function ItemForm({
  value, categories, onChange, onToast,
}: {
  value: Partial<MenuItem>; categories: MenuCategory[];
  onChange: (value: Partial<MenuItem>) => void;
  onToast?: (msg: string, type?: 'success' | 'error' | 'warning') => void;
}) {
  const [uploading, setUploading] = useState(false);
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
      <div className="item-image-field">
        <TextField label="图片 URL" value={value.image_url} onChange={(v) => onChange({ ...value, image_url: v })} />
        {value.image_url ? <img src={value.image_url} alt="" className="item-image-preview" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} /> : null}
        <label className="item-upload-btn">
          <Upload size={14} />{uploading ? '上传中…' : '上传图片'}
          <input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={async (e) => {
            const file = e.target.files?.[0]; if (!file) return;
            const err = validateImageFile(file);
            if (err) { onToast?.(err, 'warning'); return; }
            setUploading(true);
            try {
              const url = await uploadMenuItemImage(file, value.id);
              onChange({ ...value, image_url: url });
              onToast?.('图片上传成功');
            } catch { onToast?.('图片上传失败，请重试', 'error'); }
            finally { setUploading(false); }
          }} />
        </label>
      </div>
      <TextField label="排序" value={value.sort_order} type="number" onChange={(v) => onChange({ ...value, sort_order: Number(v) })} />
      <div className="item-status-select">
        <span className="field-label">状态</span>
        <div className="status-options">
          {(['available', 'delisted', 'sold_out'] as const).map((opt) => {
            const key = opt === 'available' ? (value.is_available !== false && !value.is_sold_out) : opt === 'sold_out' ? Boolean(value.is_sold_out) : (value.is_available === false);
            return (
              <button key={opt} type="button" className={`status-opt${key ? ' selected' : ''}`}
                onClick={() => {
                  if (opt === 'available') onChange({ ...value, is_available: true, is_sold_out: false });
                  else if (opt === 'delisted') onChange({ ...value, is_available: false, is_sold_out: false });
                  else onChange({ ...value, is_available: true, is_sold_out: true });
                }}>
                {{ available: '上架', delisted: '下架', sold_out: '售罄' }[opt]}
              </button>
            );
          })}
        </div>
      </div>
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
      <div className="item-options-section">
        <strong style={{ fontSize: 14 }}>口味选项</strong>

        {/* 模板按钮 */}
        <div className="options-template-row">
          <button type="button" className="secondary-button"
            onClick={() => onChange({ ...value, options: addOptionTemplate(value.options ?? [], 'spicy') })}>
            添加辣度选项
          </button>
          <button type="button" className="secondary-button"
            onClick={() => onChange({ ...value, options: addOptionTemplate(value.options ?? [], 'special') })}>
            添加特殊要求
          </button>
          <button type="button" className="secondary-button"
            onClick={() => onChange({ ...value, options: addOptionTemplate(value.options ?? [], 'temperature') })}>
            添加饮料温度
          </button>
          <button type="button" className="secondary-button"
            style={{ color: '#dc2626' }}
            onClick={() => onChange({ ...value, options: [] })}>
            清除全部选项
          </button>
        </div>

        {/* 已添加的选项组卡片 */}
        {((value.options ?? []) as MenuItemOptionGroup[]).map((group) => (
          <div className="option-group-card" key={group.id}>
            <div className="ogc-head">
              <strong>{group.name_zh}</strong>
              <span className="ogc-meta">
                {group.type === 'single' ? '单选' : '多选'} · {group.required ? '必选' : '非必选'}
              </span>
              <button type="button" className="ogc-delete"
                onClick={() => onChange({ ...value, options: removeOptionGroup((value.options ?? []) as MenuItemOptionGroup[], group.id) })}>
                删除
              </button>
            </div>
            <div className="ogc-choices">
              {group.choices.map((c) => (
                <span className="ogc-chip" key={c.id}>{c.name_zh}</span>
              ))}
            </div>
          </div>
        ))}

        {/* 高级 JSON 编辑（收起） */}
        <details className="item-options-json">
          <summary>高级 JSON 编辑</summary>
          <textarea
            className="text-field"
            rows={8}
            style={{ fontFamily: 'monospace', fontSize: 12 }}
            value={JSON.stringify(value.options ?? [], null, 2)}
            onChange={(e) => {
              const raw = e.target.value.trim();
              if (!raw) { onChange({ ...value, options: [] }); return; }
              try {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) onChange({ ...value, options: parsed });
              } catch { /* 非法 JSON 忽略，不覆盖 */ }
            }}
          />
          <p className="options-json-hint">格式错误时不会保存，非数组会被忽略。</p>
        </details>
      </div>
    </div>
  );
}

/* ── 前台点单 POS ── */

type POSCartEntry = {
  menuItemId: string;
  nameZh: string;
  nameEn: string | null;
  nameEl: string | null;
  price: number;
  quantity: number;
  selectedOptions: SelectedOption[];
};

function posEntryKey(menuItemId: string, options: SelectedOption[]) {
  return `${menuItemId}::${JSON.stringify(options)}`;
}

function POSTab({ toast, requestSync }: { toast: (msg: string, type?: 'success' | 'error' | 'warning') => void; requestSync: () => void; }) {
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [selectedTableId, setSelectedTableId] = useState<string>('');
  const [groups, setGroups] = useState<MenuGroup[]>([]);
  const [cart, setCart] = useState<POSCartEntry[]>([]);
  const [orderType, setOrderType] = useState<'dine_in' | 'takeaway'>('dine_in');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'pos' | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [optionsItem, setOptionsItem] = useState<MenuItem | null>(null);
  const [optionsPicked, setOptionsPicked] = useState<Record<string, string | string[]>>({});
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchRestaurantTables().then(setTables).catch(() => {});
    getPublicMenu().then(setGroups).catch(() => {});
  }, []);

  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return groups;
    return groups
      .map((g) => ({
        ...g,
        items: g.items.filter((item) =>
          (item.name_zh || '').toLowerCase().includes(q) ||
          (item.name_en || '').toLowerCase().includes(q) ||
          (item.name_el || '').toLowerCase().includes(q)
        ),
      }))
      .filter((g) => g.items.length > 0);
  }, [groups, search]);

  const cartTotal = cart.reduce((s, e) => s + e.quantity * e.price, 0);
  const cartCount = cart.reduce((s, e) => s + e.quantity, 0);

  function addToCart(item: MenuItem, selectedOptions: SelectedOption[] = []) {
    setCart((prev) => {
      const key = posEntryKey(item.id, selectedOptions);
      const idx = prev.findIndex((e) => posEntryKey(e.menuItemId, e.selectedOptions) === key);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 };
        return next;
      }
      return [...prev, {
        menuItemId: item.id, nameZh: item.name_zh, nameEn: item.name_en, nameEl: item.name_el,
        price: Number(item.price), quantity: 1, selectedOptions,
      }];
    });
  }

  function openOptions(item: MenuItem) {
    const initial: Record<string, string | string[]> = {};
    for (const g of (item.options ?? [])) initial[g.id] = g.type === 'multiple' ? [] : '';
    setOptionsPicked(initial); setOptionsError(null); setOptionsItem(item);
  }

  function toggleOption(groupId: string, choiceId: string, multi: boolean) {
    setOptionsPicked((prev) => {
      if (multi) {
        const cur = (prev[groupId] as string[]) || [];
        return { ...prev, [groupId]: cur.includes(choiceId) ? cur.filter((c) => c !== choiceId) : [...cur, choiceId] };
      }
      return { ...prev, [groupId]: prev[groupId] === choiceId ? '' : choiceId };
    });
    setOptionsError(null);
  }

  function confirmOptions() {
    if (!optionsItem) return;
    const groups = optionsItem.options ?? [];
    for (const g of groups) {
      if (!g.required) continue;
      const v = optionsPicked[g.id];
      if (!v || (Array.isArray(v) && v.length === 0)) { setOptionsError('请完成所有必选项'); return; }
    }
    const selected: SelectedOption[] = [];
    for (const g of groups) {
      const v = optionsPicked[g.id];
      if (!v || (Array.isArray(v) && v.length === 0)) continue;
      for (const cid of (Array.isArray(v) ? v : [v])) {
        const c = g.choices.find((x) => x.id === cid);
        if (!c) continue;
        selected.push({ group_id: g.id, group_name_zh: g.name_zh, group_name_en: g.name_en, group_name_el: g.name_el, choice_id: c.id, choice_name_zh: c.name_zh, choice_name_en: c.name_en, choice_name_el: c.name_el });
      }
    }
    addToCart(optionsItem, selected);
    setOptionsItem(null); setOptionsPicked({});
  }

  async function submitPOS() {
    if (cart.length === 0) return;
    try {
      setSubmitting(true);
      const items = cart.map((e) => ({ menu_item_id: e.menuItemId, quantity: e.quantity, selected_options: e.selectedOptions, note: '' }));
      const result = await posSubmitOrder(selectedTableId || null, items, undefined, paymentMethod, orderType);
      toast(`POS 订单 #${result.order_number} 已提交${paymentMethod === 'cash' ? '（现金）' : paymentMethod === 'pos' ? '（刷卡）' : ''}`);
      setCart([]);
      setPaymentMethod(null);
      requestSync();
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    } finally { setSubmitting(false); }
  }

  return (
    <main className="pos-shell">
      <div className="pos-menu">
        <div className="pos-toolbar">
          <input className="pos-search" type="text" placeholder="搜索菜品…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <nav className="pos-category-tabs">
          {filteredGroups.map((g) => (
            <a href={`#pos-cat-${g.id}`} key={g.id} className="pos-cat-tab" onClick={(e) => { e.preventDefault(); document.getElementById(`pos-cat-${g.id}`)?.scrollIntoView({ behavior: 'smooth' }); }}>{g.name_zh || g.name_en}</a>
          ))}
        </nav>
        <div className="pos-menu-list">
          {filteredGroups.map((g) => (
            <section key={g.id} id={`pos-cat-${g.id}`} className="pos-category">
              <h3>{g.name_zh || g.name_en}</h3>
              <div className="pos-items">
                {g.items.map((item) => {
                  const soldOut = item.is_sold_out || !item.is_available;
                  return (
                    <div key={item.id} className={`pos-item${soldOut ? ' sold-out' : ''}`}>
                      <div className="pos-item-info">
                        <strong>{item.name_zh || item.name_en}</strong>
                        <span>{formatPrice(Number(item.price))}</span>
                        {soldOut ? <span className="pos-soldout">售罄</span> : null}
                      </div>
                      <button className="pos-add-btn" disabled={soldOut}
                        onClick={() => (item.options && item.options.length > 0) ? openOptions(item) : addToCart(item)}>
                        <Plus size={14} />添加
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>

      <aside className="pos-cart">
        <h2>当前点单{orderType === 'takeaway' ? ' · 外带' : selectedTableId ? ` · ${tables.find((t) => t.id === selectedTableId)?.table_number ?? '?'} 号桌` : ' · 堂食'}</h2>
        <div className="pos-meta">
          <div className="pos-type-row">
            <button className={`pos-type-btn${orderType === 'dine_in' ? ' active' : ''}`} onClick={() => setOrderType('dine_in')}>堂食</button>
            <button className={`pos-type-btn${orderType === 'takeaway' ? ' active' : ''}`} onClick={() => { setOrderType('takeaway'); setSelectedTableId(''); }}>外带</button>
          </div>
          {orderType === 'dine_in' ? (
            <label className="filter-label">桌号
              <select value={selectedTableId} onChange={(e) => setSelectedTableId(e.target.value)} style={{ width: '100%' }}>
                <option value="">未指定</option>
                {tables.filter((t) => t.is_active).map((t) => (
                  <option value={t.id} key={t.id}>{t.table_number} 号桌{t.label ? ` (${t.label})` : ''}</option>
                ))}
              </select>
            </label>
          ) : <p className="muted" style={{ margin: 0 }}>外带订单，无需选择桌号</p>}
        </div>
        {cart.length === 0 ? <p className="muted">购物车为空</p> : (
          <>
            <div className="pos-cart-lines">
              {cart.map((e, i) => (
                <div key={i} className="pos-cart-line">
                  <div className="pcl-info">
                    <strong>{e.nameZh || e.nameEn}</strong>
                    {e.selectedOptions.length > 0 ? <small>{e.selectedOptions.map((o) => o.choice_name_zh).join('、')}</small> : null}
                    <span>{formatPrice(e.price)} × {e.quantity} = {formatPrice(e.price * e.quantity)}</span>
                  </div>
                  <div className="pcl-actions">
                    <button onClick={() => setCart((prev) => { const next = [...prev]; if (next[i].quantity <= 1) { next.splice(i, 1); return next; } next[i] = { ...next[i], quantity: next[i].quantity - 1 }; return next; })} disabled={e.quantity <= 1}><Minus size={12} /></button>
                    <strong>{e.quantity}</strong>
                    <button onClick={() => setCart((prev) => { const next = [...prev]; next[i] = { ...next[i], quantity: next[i].quantity + 1 }; return next; })} disabled={e.quantity >= 99}><Plus size={12} /></button>
                    <button className="pcl-del" onClick={() => setCart((prev) => prev.filter((_, j) => j !== i))}><Trash2 size={12} /></button>
                  </div>
                </div>
              ))}
            </div>
            <div className="pos-cart-total"><span>{cartCount} 件</span><strong>{formatPrice(cartTotal)}</strong></div>
            <div className="pos-payment-row">
              <label className={`pos-pay-opt${paymentMethod === null ? ' selected' : ''}`}>
                <input type="radio" name="pos-payment" checked={paymentMethod === null} onChange={() => setPaymentMethod(null)} />未付款
              </label>
              <label className={`pos-pay-opt${paymentMethod === 'cash' ? ' selected' : ''}`}>
                <input type="radio" name="pos-payment" checked={paymentMethod === 'cash'} onChange={() => setPaymentMethod('cash')} />现金
              </label>
              <label className={`pos-pay-opt${paymentMethod === 'pos' ? ' selected' : ''}`}>
                <input type="radio" name="pos-payment" checked={paymentMethod === 'pos'} onChange={() => setPaymentMethod('pos')} />刷卡
              </label>
            </div>
            <div className="pos-cart-actions">
              <button className="secondary-button" onClick={() => setCart([])} disabled={submitting}>清空</button>
              <button className="primary-button" disabled={cart.length === 0 || submitting} onClick={submitPOS}>{submitting ? '提交中...' : '提交订单'}</button>
            </div>
          </>
        )}
      </aside>

      {optionsItem ? (
        <div className="cart-note-backdrop" onClick={() => { setOptionsItem(null); setOptionsError(null); }}>
          <div className="cart-note-panel options-panel" onClick={(e) => e.stopPropagation()}>
            <div className="cart-note-head"><h3>{optionsItem.name_zh || optionsItem.name_en}</h3><button onClick={() => { setOptionsItem(null); setOptionsError(null); }}><X size={18} /></button></div>
            <div className="options-groups">
              {(optionsItem.options ?? []).map((group) => (
                <div className="options-group" key={group.id}>
                  <div className="options-group-head"><strong>{group.name_zh}</strong>{group.required ? <span className="options-required">必选</span> : null}</div>
                  <div className="options-choices">
                    {group.choices.map((c) => {
                      const active = group.type === 'multiple' ? ((optionsPicked[group.id] as string[]) || []).includes(c.id) : optionsPicked[group.id] === c.id;
                      return <button key={c.id} className={`option-chip${active ? ' active' : ''}`} onClick={() => toggleOption(group.id, c.id, group.type === 'multiple')}>{c.name_zh}</button>;
                    })}
                  </div>
                </div>
              ))}
            </div>
            {optionsError ? <p className="options-error">{optionsError}</p> : null}
            <div className="cart-note-actions"><button className="secondary-button" onClick={() => { setOptionsItem(null); setOptionsError(null); }}>取消</button><button className="primary-button" onClick={confirmOptions}>确定</button></div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
