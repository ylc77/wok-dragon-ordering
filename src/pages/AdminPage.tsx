import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { Activity, Ban, Banknote, BarChart3, Building2, CalendarDays, CheckCircle2, ChefHat, ChevronDown, Clock3, ClipboardList, Copy, CreditCard, Database, Download, LayoutDashboard, LogOut, Menu, Minus, PauseCircle, Pencil, PlayCircle, Plus, Printer, QrCode, RefreshCw, RotateCcw, Save, Search, Settings2, ShoppingBag, Tags, Trash2, Upload, UserCircle, UtensilsCrossed, WalletCards, Wifi, WifiOff, X } from 'lucide-react';
import { ReservationManager } from '../components/admin/ReservationManager';
import '../styles/admin.css';
import '../styles/print.css';
import { LegalSubmissionNotice } from '../components/LegalSubmissionNotice';
import { formatPrice, getLocalizedField } from '../lib/localized';
import { DEFAULT_FEATURE_FLAGS, getFeatureFlags } from '../lib/featureFlags';
import { getPublicMenu, getRestaurantSettings, adminHardDeleteMenuCategory, adminHardDeleteMenuItem, uploadMenuItemImage, uploadRestaurantImage, validateImageFile } from '../lib/menuApi';
import { hasSupabaseConfig, supabase } from '../lib/supabase';
import { downloadFile, exportRowsToCSV, exportRowsToJSON, fetchAllTableData, generateBackupFilename } from '../lib/dataExport';
import {
  adminConfirmOrderPayment,
  adminHardDeleteOrder,
  approveTableReentry,
  closeTableSession,
  confirmBillAndCloseSession,
  createRestaurantTable,
  deleteRestaurantTable,
  fetchActiveSessions,
  fetchAdminDashboardSummary,
  fetchAdminOrderPage,
  fetchAdminOrderStats,
  fetchAdminOrders,
  fetchAdminPendingOrders,
  fetchPrintAgentStatus,
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
  AdminRole,
  FeatureFlags,
  MenuCategory,
  MenuGroup,
  MenuItem,
  MenuItemOptionGroup,
  Order,
  OrderItem,
  OrderStatus,
  PrintAgentStatus,
  RealtimeConnectionStatus,
  RestaurantSettings,
  RestaurantTable,
  SelectedOption,
  TableReentryRequest,
  TableSession,
} from '../lib/types';

type AdminTab = 'dashboard' | 'settings' | 'categories' | 'items' | 'orders' | 'tables' | 'system' | 'pos' | 'reservations';

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

type AdminConfirmOptions = {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

function useAdminConfirm() {
  const [options, setOptions] = useState<AdminConfirmOptions | null>(null);
  const resolverRef = useRef<((confirmed: boolean) => void) | null>(null);

  const close = useCallback((confirmed: boolean) => {
    resolverRef.current?.(confirmed);
    resolverRef.current = null;
    setOptions(null);
  }, []);

  const confirm = useCallback((nextOptions: AdminConfirmOptions) => {
    setOptions(nextOptions);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const dialog = options ? (
    <div className="print-confirm-overlay" onClick={() => close(false)}>
      <div className="print-confirm-dialog" onClick={(event) => event.stopPropagation()}>
        <h3>{options.title}</h3>
        <p>{options.message}</p>
        <div className="print-confirm-actions">
          <button className="secondary-button" type="button" onClick={() => close(false)}>
            {options.cancelLabel ?? '取消'}
          </button>
          <button className={options.danger ? 'settings-danger-btn' : 'primary-button'} type="button" onClick={() => close(true)}>
            {options.confirmLabel ?? '确认'}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return { confirm, dialog };
}

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
  const [adminRole, setAdminRole] = useState<AdminRole | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(() => {
    try { return localStorage.getItem('restaurant:order-sound-enabled') !== '0'; } catch { return true; }
  });
  const [restaurantName, setRestaurantName] = useState('餐馆');
  const [paperWidth, setPaperWidth] = useState(() => {
    try { const v = localStorage.getItem('restaurant_ticket_paper_width'); return v === '58' ? '58' : '80'; } catch { return '80'; }
  });
  const [enablePos, setEnablePos] = useState(true);
  const [enableQrOrdering, setEnableQrOrdering] = useState(true);
  const [featureFlags, setFeatureFlags] = useState<FeatureFlags>(DEFAULT_FEATURE_FLAGS);
  const [syncVersion, setSyncVersion] = useState(0);
  const requestSync = useCallback(() => setSyncVersion((c) => c + 1), []);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  // 纯菜单模式：无 POS 且无扫码点餐 → 默认进菜品管理
  const menuOnlyMode = !enablePos && !enableQrOrdering;
  useEffect(() => {
    if (menuOnlyMode && (tab === 'dashboard' || tab === 'orders' || tab === 'tables' || tab === 'pos')) {
      setTab('items');
    }
  }, [menuOnlyMode, tab]);

  const closeDrawer = () => setMobileDrawerOpen(false);
  const onTabChange = (t: AdminTab) => {
    setTab(t);
    closeDrawer();
  };

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

      const allowed = !error && (profile?.role === 'admin' || profile?.role === 'staff' || profile?.role === 'kitchen');
      setLoggedIn(allowed);
      setAdminEmail(allowed ? (session.user.email ?? '管理员') : '管理员');
      setAdminRole(allowed ? (profile?.role as AdminRole) : null);
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
    supabase.from('restaurant_settings').select('*').limit(1).maybeSingle().then(({ data: s }) => {
      setRestaurantName(s?.name_zh || s?.name_en || s?.name_el || '餐馆');
      setEnablePos(s?.enable_pos !== false);
      setEnableQrOrdering(s?.enable_qr_ordering !== false);
      setFeatureFlags(getFeatureFlags(s as RestaurantSettings | null));
    });
  }, [syncVersion]);

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

  useEffect(() => {
    if (adminRole === 'kitchen' && tab !== 'orders') {
      setTab('orders');
    }
  }, [adminRole, tab]);

  if (!hasSupabaseConfig || !supabase) {
    return (
      <main className="admin-login">
        <div className="admin-empty app-state-card admin-config-empty">
          <span className="admin-login-mark"><UtensilsCrossed size={24} /></span>
          <h1>后台管理</h1>
          <p>请先配置 `.env.local` 中的 Supabase URL 和 publishable key。</p>
        </div>
      </main>
    );
  }

  if (!sessionReady) {
    return (
      <main className="admin-login">
        <div className="admin-empty app-state-card">
          <span className="state-spinner" aria-hidden="true" />
          <h1>正在加载后台</h1>
          <p>请稍候，正在确认登录状态。</p>
        </div>
      </main>
    );
  }

  if (!loggedIn) {
    return <AdminLogin onMessage={setMessage} message={message} />;
  }
  const isKitchenRole = adminRole === 'kitchen';

  return (
    <main className="admin-shell">
      {/* 桌面端侧边栏 */}
      <aside className="admin-sidebar">
        <Link className="admin-brand" to="/">
          <span className="admin-brand-mark">餐</span>
          <span>后台管理</span>
        </Link>
        <nav className="admin-nav-list">
          {!isKitchenRole && enablePos ? <AdminNavButton icon={<ShoppingBag size={16} />} active={tab === 'pos'} onClick={() => onTabChange('pos')}>前台点单</AdminNavButton> : null}
          {!isKitchenRole && (enablePos || enableQrOrdering) ? <AdminNavButton icon={<LayoutDashboard size={16} />} active={tab === 'dashboard'} onClick={() => onTabChange('dashboard')}>经营概览</AdminNavButton> : null}
          {(enablePos || enableQrOrdering) ? <AdminNavButton icon={<ClipboardList size={16} />} active={tab === 'orders'} onClick={() => onTabChange('orders')}>订单管理</AdminNavButton> : null}
          {!isKitchenRole && enableQrOrdering ? <AdminNavButton icon={<QrCode size={16} />} active={tab === 'tables'} onClick={() => onTabChange('tables')}>桌台 / 二维码</AdminNavButton> : null}
          {!isKitchenRole ? <AdminNavButton icon={<UtensilsCrossed size={16} />} active={tab === 'items'} onClick={() => onTabChange('items')}>菜品管理</AdminNavButton> : null}
          {!isKitchenRole ? <AdminNavButton icon={<Tags size={16} />} active={tab === 'categories'} onClick={() => onTabChange('categories')}>菜单分类</AdminNavButton> : null}
          {!isKitchenRole ? <AdminNavButton icon={<Building2 size={16} />} active={tab === 'settings'} onClick={() => onTabChange('settings')}>餐馆设置</AdminNavButton> : null}
          {!isKitchenRole && featureFlags.reservations ? <AdminNavButton icon={<CalendarDays size={16} />} active={tab === 'reservations'} onClick={() => onTabChange('reservations')}>预订管理</AdminNavButton> : null}
          {!isKitchenRole ? <AdminNavButton icon={<Settings2 size={16} />} active={tab === 'system'} onClick={() => onTabChange('system')}>系统设置</AdminNavButton> : null}
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
          {!isKitchenRole && enablePos ? <AdminNavButton icon={<ShoppingBag size={16} />} active={tab === 'pos'} onClick={() => onTabChange('pos')}>前台点单</AdminNavButton> : null}
          {!isKitchenRole && (enablePos || enableQrOrdering) ? <AdminNavButton icon={<LayoutDashboard size={16} />} active={tab === 'dashboard'} onClick={() => onTabChange('dashboard')}>经营概览</AdminNavButton> : null}
          {(enablePos || enableQrOrdering) ? <AdminNavButton icon={<ClipboardList size={16} />} active={tab === 'orders'} onClick={() => onTabChange('orders')}>订单管理</AdminNavButton> : null}
          {!isKitchenRole && enableQrOrdering ? <AdminNavButton icon={<QrCode size={16} />} active={tab === 'tables'} onClick={() => onTabChange('tables')}>桌台 / 二维码</AdminNavButton> : null}
          {!isKitchenRole ? <AdminNavButton icon={<UtensilsCrossed size={16} />} active={tab === 'items'} onClick={() => onTabChange('items')}>菜品管理</AdminNavButton> : null}
          {!isKitchenRole ? <AdminNavButton icon={<Tags size={16} />} active={tab === 'categories'} onClick={() => onTabChange('categories')}>菜单分类</AdminNavButton> : null}
          {!isKitchenRole ? <AdminNavButton icon={<Building2 size={16} />} active={tab === 'settings'} onClick={() => onTabChange('settings')}>餐馆设置</AdminNavButton> : null}
          {!isKitchenRole && featureFlags.reservations ? <AdminNavButton icon={<CalendarDays size={16} />} active={tab === 'reservations'} onClick={() => onTabChange('reservations')}>预订管理</AdminNavButton> : null}
          {!isKitchenRole ? <AdminNavButton icon={<Settings2 size={16} />} active={tab === 'system'} onClick={() => onTabChange('system')}>系统设置</AdminNavButton> : null}
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
          {tab === 'dashboard' ? (menuOnlyMode ? <AdminSection title="仪表盘"><p className="admin-message-muted">当前为纯菜单展示模式，暂未启用点餐功能。</p></AdminSection> : <Dashboard syncVersion={syncVersion} onMessage={setMessage} toast={showAdminToast} onOpenOrders={() => setTab('orders')} setTab={setTab} enableQrOrdering={enableQrOrdering} />) : null}
          {tab === 'orders' ? (menuOnlyMode ? <AdminSection title="订单管理"><p className="admin-message-muted">当前为纯菜单展示模式，暂未启用点餐功能。</p></AdminSection> : <OrderManager syncVersion={syncVersion} requestSync={requestSync} onMessage={setMessage} toast={showAdminToast} soundEnabled={soundEnabled} onSoundEnabledChange={setSoundEnabled} restaurantName={restaurantName} paperWidth={paperWidth} setPaperWidth={setPaperWidth} readOnly={isKitchenRole} />) : null}
          {tab === 'tables' ? (enableQrOrdering ? <TableManager syncVersion={syncVersion} onMessage={setMessage} toast={showAdminToast} /> : <AdminSection title="桌台管理"><p className="admin-message-muted">当前未启用扫码点餐功能，桌台管理已关闭。</p></AdminSection>) : null}
          {tab === 'settings' ? <SettingsEditor onMessage={setMessage} toast={showAdminToast} requestSync={requestSync} /> : null}
          {tab === 'reservations' && featureFlags.reservations ? <ReservationManager toast={showAdminToast} /> : null}
          {tab === 'categories' ? <CategoryEditor onMessage={setMessage} toast={showAdminToast} /> : null}
          {tab === 'items' ? <ItemEditor onMessage={setMessage} toast={showAdminToast} features={featureFlags} /> : null}
          {tab === 'system' ? <SystemSettings realtimeStatus={realtimeStatus} adminRole={adminRole} features={featureFlags} /> : null}
          {tab === 'pos' ? <POSTab toast={showAdminToast} requestSync={requestSync} soundEnabled={soundEnabled} onOpenOrders={() => setTab('orders')} restaurantName={restaurantName} /> : null}
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
        <span className="admin-login-mark"><UtensilsCrossed size={24} /></span>
        <h1>后台登录</h1>
        <p className="admin-login-subtitle">餐馆订单、菜单、桌台和 POS 管理入口</p>
        <label>
          邮箱
          <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" />
        </label>
        <label>
          密码
          <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" />
        </label>
        {message ? <p className="error-text">{message}</p> : null}
        <LegalSubmissionNotice className="admin-legal-notice" />
        <button className="primary-button stretch" type="submit">
          登录
        </button>
      </form>
    </main>
  );
}

function Dashboard({
  onMessage, toast, onOpenOrders, syncVersion, setTab, enableQrOrdering,
}: {
  onMessage: (value: string | null) => void;
  toast: (msg: string, type?: 'success' | 'error' | 'warning') => void;
  onOpenOrders: () => void;
  syncVersion: number;
  setTab: (tab: AdminTab) => void;
  enableQrOrdering: boolean;
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
        {enableQrOrdering ? <button className="quick-action-btn" onClick={() => setTab('tables')}><QrCode size={16} />管理桌台</button> : null}
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

function SettingsEditor({ onMessage, toast, requestSync }: { onMessage: (value: string | null) => void; toast: (msg: string, type?: 'success' | 'error' | 'warning') => void; requestSync: () => void; }) {
  const [settings, setSettings] = useState<Partial<RestaurantSettings>>(emptySettings);
  const { confirm, dialog } = useAdminConfirm();

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
    if (!settings.id) {
      onMessage('未找到餐馆设置记录，请先完成数据库初始化。');
      return;
    }
    const payload = {
      name_zh: settings.name_zh ?? '', name_en: settings.name_en ?? '', name_el: settings.name_el ?? '',
      logo_url: settings.logo_url || null, hero_image_url: settings.hero_image_url || null,
      intro_zh: settings.intro_zh ?? '', intro_en: settings.intro_en ?? '', intro_el: settings.intro_el ?? '',
      phone: settings.phone ?? '', whatsapp_url: settings.whatsapp_url ?? '', instagram_url: settings.instagram_url ?? '',
      address_zh: settings.address_zh ?? '', address_en: settings.address_en ?? '', address_el: settings.address_el ?? '',
      map_url: settings.map_url ?? '',
      opening_hours_zh: settings.opening_hours_zh ?? '', opening_hours_en: settings.opening_hours_en ?? '', opening_hours_el: settings.opening_hours_el ?? '',
      wolt_url: settings.wolt_url ?? '', efood_url: settings.efood_url ?? '', box_url: settings.box_url ?? '',
      accept_pos_payment: settings.accept_pos_payment !== false, accept_cash_payment: settings.accept_cash_payment !== false,
      brand_color: settings.brand_color || null, favicon_url: settings.favicon_url || null, meta_title: settings.meta_title || null,
      footer_text_zh: settings.footer_text_zh ?? '', footer_text_en: settings.footer_text_en ?? '', footer_text_el: settings.footer_text_el ?? '',
    };
    const { error } = await supabase.from('restaurant_settings').update(payload).eq('id', settings.id);
    if (error) onMessage(error.message); else { toast('餐馆信息已保存'); requestSync(); }
    if (!error) load();
  }

  async function toggleOrdering() {
    const nextEnabled = settings.ordering_enabled === false;
    const action = nextEnabled ? '\u6062\u590d\u63a5\u5355' : '\u6682\u505c\u63a5\u5355';
    const msg = nextEnabled
      ? '\u6062\u590d\u540e\uff0c\u987e\u5ba2\u53ef\u4ee5\u7ee7\u7eed\u52a0\u83dc\u5e76\u63d0\u4ea4\u8ba2\u5355\u3002'
      : '\u6682\u505c\u540e\uff0c\u987e\u5ba2\u65e0\u6cd5\u63d0\u4ea4\u65b0\u8ba2\u5355\uff0c\u4f46\u4ecd\u53ef\u4ee5\u8bf7\u6c42\u7ed3\u8d26\u3002';
    if (!(await confirm({ title: action, message: msg, confirmLabel: action, danger: !nextEnabled }))) return;
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

      {/* ── 品牌外观 ── */}
      <div className="settings-card">
        <div className="settings-card-head"><h3>品牌外观</h3><p className="settings-card-desc">自定义网站主色调、浏览器标题栏和图标。</p></div>
        <div className="settings-grid-2">
          <TextField label="主色调" value={settings.brand_color} onChange={(v) => setSettings({ ...settings, brand_color: v })} />
          <TextField label="网页标题" value={settings.meta_title} onChange={(v) => setSettings({ ...settings, meta_title: v })} />
          <TextField label="浏览器图标 URL" value={settings.favicon_url} onChange={(v) => setSettings({ ...settings, favicon_url: v })} />
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
      {dialog}
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
    if (!supabase) return false;
    const isNew = !category.id;
    const payload = { name_zh: category.name_zh ?? '', name_en: category.name_en ?? '', name_el: category.name_el ?? '', sort_order: Number(category.sort_order ?? 0), is_active: Boolean(category.is_active) };
    const { error } = category.id ? await supabase.from('menu_categories').update(payload).eq('id', category.id) : await supabase.from('menu_categories').insert(payload);
    if (error) {
      onMessage(error.message);
      return false;
    }
    toast(isNew ? '\u5206\u7c7b\u5df2\u521b\u5efa' : '\u5206\u7c7b\u5df2\u4fdd\u5b58');
    setDraft(emptyCategory);
    setShowNewForm(false);
    setEditingId(null);
    await load();
    return true;
  }
  function promptDeleteCategory(category: MenuCategory) {
    if (!supabase) return;
    setDeleteTarget(category); setDeletePassword(''); setDeleteError(null); setDeleteDialogOpen(true);
  }

  async function executeDeleteCategory() {
    if (!deleteTarget) return;
    if (!deletePassword.trim()) { setDeleteError('请输入确认密码'); return; }
    setDeleting(true); setDeleteError(null);
    try {
      await adminHardDeleteMenuCategory(deleteTarget.id, deletePassword);
      toast(`已归档分类"${deleteTarget.name_zh || deleteTarget.name_en || deleteTarget.name_el}"`);
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
          <CategoryForm value={draft} onChange={setDraft} />
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
          <div className={`admin-row${editingId === c.id ? ' category-edit-row' : ''}`} key={c.id}>
            {editingId === c.id ? (
              <>
                <CategoryForm value={{ ...c }} onChange={(v) => setCategories((prev) => prev.map((x) => x.id === c.id ? { ...x, ...v } : x))} />
                <div className="admin-row-actions category-edit-actions">
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
                  <button className="danger-text" type="button" onClick={() => promptDeleteCategory(c)}><Trash2 size={14} />归档</button>
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
            <h2>归档分类确认</h2>
            <p className="dialog-warning-text">
              ⚠ 归档后，分类"{deleteTarget.name_zh || deleteTarget.name_en || deleteTarget.name_el}"会从前台菜单隐藏，分类下菜品也会一并隐藏/归档；历史订单记录不受影响。
            </p>
            <div className="dialog-password-wrap">
              <label className="dialog-password-label">请输入确认密码</label>
              <input type="password" className="text-field" value={deletePassword} onChange={(e) => { setDeletePassword(e.target.value); setDeleteError(null); }} placeholder="输入确认密码" autoFocus disabled={deleting} onKeyDown={(e) => { if (e.key === 'Enter' && !deleting) void executeDeleteCategory(); }} />
            </div>
            {deleteError ? <p className="dialog-error-text">{deleteError}</p> : null}
            <div className="print-confirm-actions">
              <button className="secondary-button" type="button" onClick={() => { setDeleteDialogOpen(false); setDeleteTarget(null); }} disabled={deleting}>取消</button>
              <button className={deleting ? 'primary-button' : 'primary-button dialog-danger-button'} type="button" onClick={() => void executeDeleteCategory()} disabled={deleting}><Trash2 size={16} />{deleting ? '归档中…' : '确认归档'}</button>
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
  'is_sold_out',
  'options',
  'sort_order',
] as const;

type MenuCsvHeader = (typeof menuCsvHeaders)[number];
const quickMenuCsvHeaders: MenuCsvHeader[] = [
  'category_zh',
  'name_zh',
  'price',
  'description_zh',
  'image_url',
  'is_available',
  'is_sold_out',
  'sort_order',
];
type MenuCsvRow = Record<MenuCsvHeader, string>;
type CsvImportResult = { success: number; failed: number; translationFailed: number; errors: string[] };
type CsvImportPreviewSummary = {
  createCategories: number;
  createItems: number;
  updateItems: number;
  missingImages: number;
  missingTranslations: number;
  optionErrors: string[];
  warnings: string[];
};
type MenuTranslationFields = Pick<
  Partial<MenuItem>,
  'name_zh' | 'description_zh' | 'name_en' | 'description_en' | 'name_el' | 'description_el'
>;

const menuCsvHeaderDescriptions: Record<MenuCsvHeader, string> = {
  category_zh: '中文分类（必填，三选一）',
  category_en: '英文分类',
  category_el: '希腊语分类',
  name_zh: '中文名称（必填，三选一）',
  name_en: '英文名称',
  name_el: '希腊语名称',
  description_zh: '中文描述',
  description_en: '英文描述',
  description_el: '希腊语描述',
  price: '价格（必填）',
  image_url: '图片URL（可后补）',
  is_available: '是否上架（true/false，可空）',
  is_sold_out: '是否售罄（true/false，可空）',
  options: '口味选项JSON（高级，可空）',
  sort_order: '排序（数字，可空）',
};

const menuCsvExampleRow: MenuCsvRow = {
  category_zh: '精选套餐',
  category_en: 'Special Menu',
  category_el: 'Ειδικό Μενού',
  name_zh: '套餐 A',
  name_en: 'Set A',
  name_el: 'Σετ A',
  description_zh: '鸡肉玉米汤、蔬菜春卷、鸡蛋炒饭',
  description_en: 'Chicken corn soup, vegetable spring rolls, egg fried rice',
  description_el: 'Σούπα κοτόπουλου με καλαμπόκι, λαχανικά spring rolls, τηγανητό ρύζι με αυγό',
  price: '18.90',
  image_url: 'https://example.com/menu/set-a.jpg',
  is_available: 'true',
  is_sold_out: 'false',
  options: JSON.stringify([
    {
      id: 'spicy',
      name_zh: '辣度',
      name_en: 'Spicy level',
      name_el: 'Επίπεδο καυτερού',
      type: 'single',
      required: true,
      choices: [
        { id: 'no', name_zh: '不辣', name_en: 'No spicy', name_el: 'Χωρίς καυτερό' },
        { id: 'mild', name_zh: '微辣', name_en: 'Mild spicy', name_el: 'Λίγο καυτερό' },
      ],
    },
  ]),
  sort_order: '1',
};

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
      is_sold_out: String(Boolean(item.is_sold_out)),
      options: JSON.stringify(item.options ?? []),
      sort_order: String(item.sort_order ?? 0),
    } satisfies MenuCsvRow;
  });
  return `\uFEFF${[menuCsvHeaders.join(','), ...rows.map((row) => menuCsvHeaders.map((header) => escapeCsv(row[header])).join(','))].join('\n')}`;
}

function buildMenuCsvTemplate(headers: MenuCsvHeader[]) {
  const rows = [
    headers,
    headers.map((header) => menuCsvHeaderDescriptions[header]),
    headers.map((header) => menuCsvExampleRow[header]),
  ];
  return `\uFEFF${rows.map((row) => row.map(escapeCsv).join(',')).join('\n')}`;
}

function parseMenuCsv(csvText: string): MenuCsvRow[] {
  const rows = parseCsvRows(csvText.replace(/^\uFEFF/, ''));
  if (rows.length === 0) return [];
  const headers = rows[0].map((header) => header.trim());
  const knownHeaders = headers.filter((header): header is MenuCsvHeader => menuCsvHeaders.includes(header as MenuCsvHeader));
  if (knownHeaders.length === 0) throw new Error('CSV 缺少可识别的菜单字段');
  const hasCategoryHeader = ['category_zh', 'category_en', 'category_el'].some((header) => headers.includes(header));
  const hasNameHeader = ['name_zh', 'name_en', 'name_el'].some((header) => headers.includes(header));
  const missing: string[] = [];
  if (!hasCategoryHeader) missing.push('category_zh/category_en/category_el');
  if (!hasNameHeader) missing.push('name_zh/name_en/name_el');
  if (!headers.includes('price')) missing.push('price');
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
    })
    .filter((row) => !isMenuCsvDescriptionRow(row));
}

function buildCsvImportPreview(
  rows: MenuCsvRow[],
  categories: MenuCategory[],
  items: MenuItem[],
): CsvImportPreviewSummary {
  const knownCategoryKeys = new Set(
    categories.flatMap((category) => [
      normalized(category.name_zh),
      normalized(category.name_en),
      normalized(category.name_el),
    ]).filter(Boolean),
  );
  const virtualCategories = [...categories];
  const optionErrors: string[] = [];
  const warnings: string[] = [];
  let createCategories = 0;
  let createItems = 0;
  let updateItems = 0;
  let missingImages = 0;
  let missingTranslations = 0;

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    if (!row.image_url.trim()) missingImages += 1;
    if (!row.name_en || !row.name_el || !row.description_en || !row.description_el) missingTranslations += 1;
    if (!row.category_zh && !row.category_en && !row.category_el) warnings.push(`第 ${rowNumber} 行缺少分类名称`);
    if (!row.name_zh && !row.name_en && !row.name_el) warnings.push(`第 ${rowNumber} 行缺少菜品名称`);
    if (!row.price || !Number.isFinite(Number(row.price))) warnings.push(`第 ${rowNumber} 行价格可能不正确`);

    if (row.options.trim()) {
      try {
        parseOptionsJson(row.options);
      } catch (error) {
        optionErrors.push(`第 ${rowNumber} 行 options：${formatUnknownError(error)}`);
      }
    }

    let category = findMatchingCategory(virtualCategories, row);
    if (!category) {
      const keys = [normalized(row.category_zh), normalized(row.category_en), normalized(row.category_el)].filter(Boolean);
      const alreadyPlanned = keys.some((key) => knownCategoryKeys.has(key));
      if (!alreadyPlanned) {
        keys.forEach((key) => knownCategoryKeys.add(key));
        createCategories += 1;
      }
      category = {
        id: `csv-preview-${createCategories}-${index}`,
        name_zh: row.category_zh || row.category_en || row.category_el || '未命名分类',
        name_en: row.category_en || null,
        name_el: row.category_el || null,
        sort_order: virtualCategories.length + 1,
        is_active: true,
      };
      virtualCategories.push(category);
    }

    const existing = findMatchingItem(items, row, category.id);
    if (existing) updateItems += 1;
    else createItems += 1;
  });

  return {
    createCategories,
    createItems,
    updateItems,
    missingImages,
    missingTranslations,
    optionErrors,
    warnings,
  };
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

function isMenuCsvDescriptionRow(row: MenuCsvRow) {
  return menuCsvHeaders.some((header) => row[header] === menuCsvHeaderDescriptions[header]);
}

function parseBoolean(value: string) {
  const normalized = value.trim().toLowerCase();
  return !['false', '0', 'no', 'n', '下架', '否'].includes(normalized);
}

function parseOptionalBoolean(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  if (['true', '1', 'yes', 'y', '是'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n', '否'].includes(normalized)) return false;
  throw new Error(`布尔值不正确：${value}`);
}

function parseOptionalNumber(value: string) {
  const normalized = value.trim();
  if (!normalized) return undefined;
  const next = Number(normalized);
  if (!Number.isFinite(next)) throw new Error(`数字不正确：${value}`);
  return next;
}

function parseOptionsJson(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error('options 不是有效的 JSON');
  }
  if (!Array.isArray(parsed)) throw new Error('options 必须是 JSON 数组');
  validateOptionGroups(parsed);
  return parsed as MenuItemOptionGroup[];
}

function validateOptionGroups(value: unknown[]) {
  value.forEach((group, groupIndex) => {
    if (!isPlainObject(group)) throw new Error(`options 第 ${groupIndex + 1} 组必须是对象`);
    if (typeof group.id !== 'string' || !group.id.trim()) throw new Error(`options 第 ${groupIndex + 1} 组缺少 id`);
    if (typeof group.name_zh !== 'string' || !group.name_zh.trim()) throw new Error(`options 第 ${groupIndex + 1} 组缺少 name_zh`);
    if (typeof group.name_en !== 'string') throw new Error(`options 第 ${groupIndex + 1} 组缺少 name_en`);
    if (typeof group.name_el !== 'string') throw new Error(`options 第 ${groupIndex + 1} 组缺少 name_el`);
    if (group.type !== 'single' && group.type !== 'multiple') throw new Error(`options 第 ${groupIndex + 1} 组 type 必须是 single 或 multiple`);
    if (typeof group.required !== 'boolean') throw new Error(`options 第 ${groupIndex + 1} 组 required 必须是 true/false`);
    if (!Array.isArray(group.choices) || group.choices.length === 0) throw new Error(`options 第 ${groupIndex + 1} 组 choices 必须是非空数组`);

    group.choices.forEach((choice, choiceIndex) => {
      if (!isPlainObject(choice)) throw new Error(`options 第 ${groupIndex + 1} 组第 ${choiceIndex + 1} 个选项必须是对象`);
      if (typeof choice.id !== 'string' || !choice.id.trim()) throw new Error(`options 第 ${groupIndex + 1} 组第 ${choiceIndex + 1} 个选项缺少 id`);
      if (typeof choice.name_zh !== 'string' || !choice.name_zh.trim()) throw new Error(`options 第 ${groupIndex + 1} 组第 ${choiceIndex + 1} 个选项缺少 name_zh`);
      if (typeof choice.name_en !== 'string') throw new Error(`options 第 ${groupIndex + 1} 组第 ${choiceIndex + 1} 个选项缺少 name_en`);
      if (typeof choice.name_el !== 'string') throw new Error(`options 第 ${groupIndex + 1} 组第 ${choiceIndex + 1} 个选项缺少 name_el`);
    });
  });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
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

type MenuAiCompletion = {
  names: Pick<MenuTranslationFields, 'name_zh' | 'name_en' | 'name_el'>;
  descriptions: Pick<MenuTranslationFields, 'description_zh' | 'description_en' | 'description_el'>;
  image_prompt: string;
};

function getAuthTokenOrThrow(session: Session | null) {
  const token = session?.access_token;
  if (!token) throw new Error('请先登录后台');
  return token;
}

async function requestMenuAiCompletion(item: Partial<MenuItem>, categoryName?: string): Promise<MenuAiCompletion> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data } = await supabase.auth.getSession();
  const token = getAuthTokenOrThrow(data.session);

  const response = await fetch('/api/admin/generate-menu-ai', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      item: {
        category_name: categoryName || '',
        name_zh: item.name_zh || '',
        name_en: item.name_en || '',
        name_el: item.name_el || '',
        description_zh: item.description_zh || '',
        description_en: item.description_en || '',
        description_el: item.description_el || '',
        price: item.price ?? '',
      },
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'AI 生成失败');
  return payload as MenuAiCompletion;
}

async function requestMenuAiImage(prompt: string) {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data } = await supabase.auth.getSession();
  const token = getAuthTokenOrThrow(data.session);

  const response = await fetch('/api/admin/generate-menu-image', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prompt }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'AI 图片生成失败');
  return base64ToFile(payload.b64_json, payload.mime_type || 'image/png', 'ai-menu-image.png');
}

function base64ToFile(base64: string, mimeType: string, filename: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new File([bytes], filename, { type: mimeType });
}

function mergeMissingAiMenuContent(value: Partial<MenuItem>, completion: MenuAiCompletion): Partial<MenuItem> {
  return {
    ...value,
    name_zh: value.name_zh || completion.names?.name_zh || '',
    name_en: value.name_en || completion.names?.name_en || '',
    name_el: value.name_el || completion.names?.name_el || '',
    description_zh: value.description_zh || completion.descriptions?.description_zh || '',
    description_en: value.description_en || completion.descriptions?.description_en || '',
    description_el: value.description_el || completion.descriptions?.description_el || '',
  };
}

function ItemEditor({ onMessage, toast, features }: { onMessage: (value: string | null) => void; toast: (msg: string, type?: 'success' | 'error' | 'warning') => void; features: FeatureFlags; }) {
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [draft, setDraft] = useState<Partial<MenuItem>>(emptyItem);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [imageFilter, setImageFilter] = useState<'all' | 'missing'>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkPrice, setBulkPrice] = useState('');
  const [csvPreview, setCsvPreview] = useState<MenuCsvRow[]>([]);
  const [csvResult, setCsvResult] = useState<CsvImportResult | null>(null);
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
      const imageMatches = imageFilter === 'all' || !item.image_url;
      const keywordMatches =
        !keyword ||
        [item.name_zh, item.name_en, item.name_el]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(keyword));
      return categoryMatches && imageMatches && keywordMatches;
    });
  }, [items, categoryFilter, imageFilter, searchTerm]);

  const totalItemPages = Math.max(1, Math.ceil(filteredItems.length / ITEMS_PER_PAGE));
  const pagedItems = useMemo(
    () => filteredItems.slice((itemPage - 1) * ITEMS_PER_PAGE, itemPage * ITEMS_PER_PAGE),
    [filteredItems, itemPage],
  );

  const selectedItems = useMemo(
    () => items.filter((item) => selectedIds.has(item.id)),
    [items, selectedIds],
  );
  const csvImportPreview = useMemo(
    () => buildCsvImportPreview(csvPreview, categories, items),
    [csvPreview, categories, items],
  );

  useEffect(() => { setItemPage(1); }, [categoryFilter, imageFilter, searchTerm]);

  const itemStats = useMemo(() => {
    const all = items.filter((i) => !i.deleted_at);
    return {
      total: all.length,
      available: all.filter((i) => i.is_available && !i.is_sold_out).length,
      soldOut: all.filter((i) => i.is_sold_out).length,
      delisted: all.filter((i) => !i.is_available).length,
      missingImages: all.filter((i) => !i.image_url).length,
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
      setDeleteError('请输入确认密码');
      return;
    }
    setDeleting(true);
    setDeleteError(null);
    try {
      for (const id of deleteTarget.ids) {
        await adminHardDeleteMenuItem(id, deletePassword);
      }
      toast(`已隐藏 ${deleteTarget.ids.length} 个菜品`);
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

  function exportMissingImageCsv() {
    const categoryById = new Map(categories.map((category) => [category.id, category]));
    const rows = items
      .filter((item) => !item.image_url && !item.deleted_at)
      .map((item) => ({
        category_zh: item.category_id ? categoryById.get(item.category_id)?.name_zh ?? '' : '',
        name_zh: item.name_zh ?? '',
        name_en: item.name_en ?? '',
        name_el: item.name_el ?? '',
        description_zh: item.description_zh ?? '',
        suggested_prompt: `realistic restaurant menu photo of ${item.name_en || item.name_zh || item.name_el}, natural light, clean plate, no text, no watermark`,
      }));
    const headers = ['category_zh', 'name_zh', 'name_en', 'name_el', 'description_zh', 'suggested_prompt'];
    const csv = `\uFEFF${[headers.join(','), ...rows.map((row) => headers.map((header) => escapeCsv(String(row[header as keyof typeof row] ?? ''))).join(','))].join('\n')}`;
    downloadFile(csv, `missing-menu-images-${dateToKey(new Date().toISOString())}.csv`, 'text/csv;charset=utf-8');
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

        const existing = findMatchingItem(itemRows, row, category.id);
        const nextAvailable = parseOptionalBoolean(row.is_available);
        const nextSoldOut = parseOptionalBoolean(row.is_sold_out);
        const nextOptions = parseOptionsJson(row.options);
        const nextSortOrder = parseOptionalNumber(row.sort_order);
        const payload = {
          category_id: category.id,
          name_zh: row.name_zh || existing?.name_zh || '',
          name_en: row.name_en || existing?.name_en || null,
          name_el: row.name_el || existing?.name_el || null,
          description_zh: row.description_zh || existing?.description_zh || null,
          description_en: row.description_en || existing?.description_en || null,
          description_el: row.description_el || existing?.description_el || null,
          price,
          image_url: row.image_url || existing?.image_url || null,
          is_available: nextAvailable ?? existing?.is_available ?? true,
          is_sold_out: nextSoldOut ?? existing?.is_sold_out ?? false,
          options: nextOptions ?? existing?.options ?? [],
          sort_order: nextSortOrder ?? existing?.sort_order ?? 0,
        };
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
    if (!supabase) return false;
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
    if (error) {
      onMessage(error.message);
      return false;
    }
    toast('菜品已保存');
    setDraft(emptyItem);
    await load();
    return true;
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

  return (
    <AdminSection title="菜品管理" subtitle="管理菜单菜品、价格、分类、图片和上下架状态" onRefresh={load}>
      {/* ─ 统计卡片 ─ */}
      <div className="item-stats-row">
        <div className="istat"><span>菜品总数</span><strong>{itemStats.total}</strong></div>
        <div className="istat istat-green"><span>已上架</span><strong>{itemStats.available}</strong></div>
        <div className="istat istat-gray"><span>已下架</span><strong>{itemStats.delisted}</strong></div>
        <div className="istat istat-orange"><span>售罄</span><strong>{itemStats.soldOut}</strong></div>
        <div className="istat istat-red"><span>缺图片</span><strong>{itemStats.missingImages}</strong></div>
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
        <button className={imageFilter === 'missing' ? 'primary-button' : 'secondary-button'} type="button" onClick={() => setImageFilter((value) => value === 'missing' ? 'all' : 'missing')}>
          {imageFilter === 'missing' ? '显示全部' : '只看缺图'}
        </button>
        <button className="secondary-button" type="button" disabled={itemStats.missingImages === 0} onClick={exportMissingImageCsv}>
          <Download size={15} />
          缺图清单
        </button>
        <button className="secondary-button" type="button" onClick={() => setShowNewForm((v) => !v)}>
          <Plus size={15} />
          {showNewForm ? '收起' : '新增'}
        </button>
        {features.csv_import ? <button className="secondary-button" type="button" onClick={() => { setShowCsvImport((v) => !v); }}>
          <Upload size={15} />
          {showCsvImport ? '收起' : '导入'}
        </button> : null}
        {features.csv_import ? <button
          className="secondary-button"
          type="button"
          onClick={() => {
            downloadFile(buildMenuCsvTemplate(quickMenuCsvHeaders), 'menu-import-quick-template.csv', 'text/csv;charset=utf-8');
          }}
        >
          <Download size={15} />
          快速CSV
        </button> : null}
        {features.csv_import ? <button
          className="secondary-button"
          type="button"
          onClick={() => {
            downloadFile(buildMenuCsvTemplate([...menuCsvHeaders]), 'menu-import-full-template.csv', 'text/csv;charset=utf-8');
          }}
        >
          <Download size={15} />
          完整CSV
        </button> : null}
        {features.csv_import ? <button className="secondary-button" type="button" onClick={exportCsv}>
          <Download size={15} />
          导出
        </button> : null}
      </div>

      {/* - 新增菜品表单（可折叠） - */}
      {showNewForm ? (
        <div className="item-new-form">
          <ItemForm value={draft} categories={categories} onChange={setDraft} onToast={toast} enableAiMenu={features.ai_menu} enableAiImage={features.ai_image} />
          <div className="item-new-form-actions">
            <button className="primary-button" type="button" onClick={() => { void saveItem(draft).then((saved) => { if (saved) setShowNewForm(false); }); }}>
              <Plus size={15} />
              保存
            </button>
          </div>
        </div>
      ) : null}

      {/* - CSV 导入面板（可折叠） - */}
      {features.csv_import && showCsvImport ? (
        <div className="csv-import-panel">
          <p className="muted" style={{ margin: 0 }}>
            快速模板适合首次录入；完整模板适合批量维护翻译、售罄、排序和口味选项。空白可选字段不会覆盖已有数据。
          </p>
          <label>
            选择 CSV 文件
            <input accept=".csv,text/csv" type="file" onChange={(event) => previewCsv(event.target.files?.[0] ?? null)} />
          </label>
          <button className="primary-button" type="button" disabled={csvPreview.length === 0} onClick={importCsv}>
            <Upload size={15} />
            确认导入
          </button>
          {csvPreview.length > 0 ? <span>预览 {csvPreview.length} 条</span> : null}
          {csvPreview.length > 0 ? (
            <div className="csv-preview-summary">
              <div><span>新增菜品</span><strong>{csvImportPreview.createItems}</strong></div>
              <div><span>更新菜品</span><strong>{csvImportPreview.updateItems}</strong></div>
              <div><span>新增分类</span><strong>{csvImportPreview.createCategories}</strong></div>
              <div><span>缺图片</span><strong>{csvImportPreview.missingImages}</strong></div>
              <div><span>待补翻译</span><strong>{csvImportPreview.missingTranslations}</strong></div>
            </div>
          ) : null}
          {csvPreview.length > 0 && (csvImportPreview.warnings.length > 0 || csvImportPreview.optionErrors.length > 0) ? (
            <div className="csv-error-box csv-preview-warning">
              {[...csvImportPreview.warnings, ...csvImportPreview.optionErrors].slice(0, 10).map((error) => (
                <p key={error}>{error}</p>
              ))}
            </div>
          ) : null}
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
          <button className="danger-inline" type="button" disabled={selectedIds.size === 0} onClick={() => promptDeleteItems(Array.from(selectedIds), `批量隐藏 ${selectedIds.size} 个菜品`)}>
            <Trash2 size={14} /> 隐藏
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
            onDelete={(target) => promptDeleteItems([target.id], `隐藏菜品"${target.name_zh || target.name_en || target.name_el}"`)}
            toast={toast}
            features={features}
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
            <h2>隐藏菜品确认</h2>
            <p className="dialog-warning-text">
              ⚠ 隐藏后，这 {deleteTarget.ids.length} 个菜品会从前台菜单和常规后台列表隐藏；历史订单记录不受影响。如果只是临时不卖，建议使用“下架”或“售罄”。
            </p>
            <div className="dialog-password-wrap">
              <label className="dialog-password-label">
                请输入确认密码
              </label>
              <input
                type="password"
                className="text-field"
                value={deletePassword}
                onChange={(e) => { setDeletePassword(e.target.value); setDeleteError(null); }}
                placeholder="输入确认密码"
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
              <button className={deleting ? 'primary-button' : 'primary-button dialog-danger-button'} type="button" onClick={() => void executeDeleteItems()} disabled={deleting}><Trash2 size={16} />{deleting ? '隐藏中…' : '确认隐藏'}</button>
            </div>
          </div>
        </div>
      ) : null}
    </AdminSection>
  );
}

function OrderManager({ onMessage, toast, syncVersion, requestSync, soundEnabled, onSoundEnabledChange, restaurantName, paperWidth, setPaperWidth, readOnly = false }: { onMessage: (value: string | null) => void; toast: (msg: string, type?: 'success' | 'error' | 'warning') => void; syncVersion: number; requestSync: () => void; soundEnabled: boolean; onSoundEnabledChange: (v: boolean) => void; restaurantName: string; paperWidth: string; setPaperWidth: (v: string) => void; readOnly?: boolean; }) {
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
        readOnly ? Promise.resolve([]) : fetchPendingBillRequests(),
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
        if (soundEnabledRef.current) {
          playOrderNotification();
          // 闪烁标题提醒
          const prevTitle = document.title;
          document.title = '🔔 新订单 - ' + (restaurantName || '订单管理');
          setTimeout(() => { document.title = prevTitle; }, 3000);
        }
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
      setDeleteError('请输入确认密码');
      return;
    }
    setDeleting(true);
    setDeleteError(null);
    try {
      for (const id of deleteTarget.ids) {
        await adminHardDeleteOrder(id, deletePassword);
      }
      toast(`已归档 ${deleteTarget.ids.length} 张订单`);
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
      {readOnly ? (
        <p className="admin-message-muted kitchen-readonly-banner">
          当前为厨房只读账号：可以查看订单和预览小票，不能收款、清桌、取消或归档订单。
        </p>
      ) : null}
      {/* ─ 结账提醒 ─ */}
      {!readOnly && billRequests.length ? (
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
          {!readOnly ? (
            <label className="tool-row">
              <input checked={autoPrintEnabled} type="checkbox" onChange={toggleAutoPrint} />
              自动打印
            </label>
          ) : null}
          <label className="tool-row">
            <input checked={soundEnabled} type="checkbox" onChange={() => { const n = !soundEnabled; onSoundEnabledChange(n); try { localStorage.setItem('restaurant:order-sound-enabled', n ? '1' : '0'); } catch { /* noop */ } if (n) { unlockAudio(); playOrderNotification(); } toast(n ? '声音提醒已开启' : '声音提醒已关闭'); }} />
            {soundEnabled ? '🔔 有声' : '🔕 静音'}
          </label>
          <button type="button" className="tool-row" style={{ background: 'none', border: '1px solid #e5e7eb', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600, padding: '4px 10px' }}
            onClick={() => { unlockAudio(); playOrderNotification(); }}>
            🔈 测试声音
          </button>
          {!isAudioUnlocked() ? <small style={{ color: '#f59e0b', fontSize: 11 }}>浏览器需点击页面后启用声音</small> : null}
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
        {!readOnly ? <div className="bulk-action-bar">
          <label className="checkbox-label">
            <input type="checkbox" checked={filteredOrders.length > 0 && filteredOrders.every((o) => selectedOrderIds.has(o.id))} onChange={(e) => { if (e.target.checked) setSelectedOrderIds(new Set(filteredOrders.map((o) => o.id))); else setSelectedOrderIds(new Set()); }} />
            全选
          </label>
          <strong>已选 {selectedOrderIds.size} 张</strong>
          <button className="danger-inline" type="button" disabled={selectedOrderIds.size === 0} onClick={() => promptDeleteOrders(Array.from(selectedOrderIds), `批量归档 ${selectedOrderIds.size} 张订单`)}><Trash2 size={14} /> 批量归档</button>
          {selectedOrderIds.size > 0 ? <button className="secondary-button" type="button" onClick={() => setSelectedOrderIds(new Set())}>取消</button> : null}
        </div> : null}

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
                      {!readOnly && !isPaid && s !== 'cancelled' ? (
                        <button className="mini-btn primary" onClick={() => setPayOrder(order)}>收款</button>
                      ) : null}
                      <button className="mini-btn" onClick={() => previewKitchenTicket(order)}>预览</button>
                      {!readOnly ? <button className="mini-btn" onClick={() => printKitchenTicket(order)}><Printer size={13} />打印</button> : null}
                      {!readOnly && !isPaid && s !== 'cancelled' ? (
                        <button className="mini-btn danger-text" onClick={() => changeStatus(order.id, 'cancelled')}>取消</button>
                      ) : null}
                      {!readOnly ? <button className="mini-btn danger-text" onClick={() => promptDeleteOrders([order.id], `归档订单 #${order.order_number}`)}><Trash2 size={13} /></button> : null}
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

      {/* ─ 归档确认弹窗 ─ */}
      {deleteDialogOpen && deleteTarget ? (
        <div className="print-confirm-overlay" onClick={() => { if (!deleting) { setDeleteDialogOpen(false); setDeleteTarget(null); } }}>
          <div className="print-confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <h2>归档订单确认</h2>
            <p className="dialog-warning-text">⚠ 归档后，这 {deleteTarget.ids.length} 张订单会从常规订单列表隐藏；历史订单明细和菜品快照仍会保留。如需查看归档数据，请从数据库或后续归档管理功能查看。</p>
            <div className="print-confirm-meta"><span>{deleteTarget.label}</span></div>
            <div className="dialog-password-wrap">
              <label className="dialog-password-label">请输入确认密码</label>
              <input type="password" className="text-field" value={deletePassword} onChange={(e) => { setDeletePassword(e.target.value); setDeleteError(null); }} placeholder="输入确认密码" autoFocus disabled={deleting} onKeyDown={(e) => { if (e.key === 'Enter' && !deleting) void executeDeleteOrders(); }} />
            </div>
            {deleteError ? <p className="dialog-error-text">{deleteError}</p> : null}
            <div className="print-confirm-actions">
              <button className="secondary-button" onClick={() => { setDeleteDialogOpen(false); setDeleteTarget(null); }} disabled={deleting}>取消</button>
              <button className={deleting ? 'primary-button' : 'primary-button dialog-danger-button'} onClick={() => void executeDeleteOrders()} disabled={deleting}><Trash2 size={16} />{deleting ? '归档中…' : '确认归档'}</button>
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

import { isAudioUnlocked, playOrderNotification, unlockAudio } from '../lib/audio';

function TableManager({ onMessage, toast, syncVersion }: { onMessage: (value: string | null) => void; toast: (msg: string, type?: 'success' | 'error' | 'warning') => void; syncVersion: number }) {
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [sessions, setSessions] = useState<TableSession[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [reentryRequests, setReentryRequests] = useState<TableReentryRequest[]>([]);
  const [newNumber, setNewNumber] = useState(1);
  const [newLabel, setNewLabel] = useState('');
  const { confirm, dialog } = useAdminConfirm();
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

  async function deleteTable(table: RestaurantTable, session: TableSession | null) {
    if ((session?.participant_count ?? 0) > 0) {
      onMessage('该桌台当前有顾客设备加入，请先清桌或结账后再删除。');
      return;
    }

    const confirmed = await confirm({
      title: '\u5220\u9664\u684c\u53f0',
      message: `\u786e\u8ba4\u5220\u9664\u684c\u53f0 ${table.table_number} \u5417\uff1f\u4ec5\u672a\u4ea7\u751f\u5386\u53f2\u8ba2\u5355\u6216\u4f1a\u8bdd\u7684\u7a7a\u684c\u53f0\u53ef\u4ee5\u5220\u9664\uff1b\u5df2\u6709\u5386\u53f2\u8bb0\u5f55\u7684\u684c\u53f0\u8bf7\u53d6\u6d88\u201c\u542f\u7528\u201d\u6765\u505c\u7528\u3002`,
      confirmLabel: '\u786e\u8ba4\u5220\u9664',
      danger: true,
    });
    if (!confirmed) return;
    try {
      await deleteRestaurantTable(table.id);
      toast('桌台已删除');
      load();
    } catch (err) {
      onMessage(formatUnknownError(err));
    }
  }

  async function regenerate(tableId: string) {
    const confirmed = await confirm({
      title: '\u91cd\u751f\u6210\u4e8c\u7ef4\u7801',
      message: '\u91cd\u751f\u6210\u540e\uff0c\u65e7\u4e8c\u7ef4\u7801\u4f1a\u7acb\u5373\u5931\u6548\uff0c\u5df2\u6253\u5370\u8d34\u5728\u684c\u4e0a\u7684\u4e8c\u7ef4\u7801\u9700\u8981\u91cd\u65b0\u6253\u5370\u548c\u66f4\u6362\u3002',
      confirmLabel: '\u786e\u8ba4\u91cd\u751f\u6210',
      danger: true,
    });
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
    if (!(await confirm({
      title: '\u6e05\u684c',
      message: '\u786e\u8ba4\u6e05\u7a7a\u8be5\u684c\u672a\u63d0\u4ea4\u8d2d\u7269\u8f66\u5e76\u7ed3\u675f\u672c\u6b21\u7528\u9910\u5417\uff1f',
      confirmLabel: '\u786e\u8ba4\u6e05\u684c',
      danger: true,
    }))) {
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
            onDelete={deleteTable}
            onRegenerate={regenerate}
            onClose={closeSession}
            onApproveReentry={approveReentry}
            onRejectReentry={rejectReentry}
            toast={toast}
          />
        ))}
      </div>
      {dialog}
    </AdminSection>
  );
}

function TableCard({
  table, session, sessionOrders, reentryRequests, restaurantName,
  onSave, onDelete, onRegenerate, onClose, onApproveReentry, onRejectReentry, toast,
}: {
  table: RestaurantTable; session: TableSession | null; sessionOrders: Order[]; reentryRequests: TableReentryRequest[]; restaurantName: string;
  onSave: (table: RestaurantTable) => void; onDelete: (table: RestaurantTable, session: TableSession | null) => void; onRegenerate: (tableId: string) => void; onClose: (session: TableSession) => void;
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
          <button
            className="maintenance-button maintenance-button-danger"
            type="button"
            disabled={occupied || openOrderCount > 0 || paymentRequested}
            onClick={() => onDelete(table, session)}
            title={(occupied || openOrderCount > 0 || paymentRequested) ? '当前桌台正在使用，不能删除' : '删除未使用过的空桌台'}
          >
            <Trash2 size={13} />
            删除桌台
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
  features,
}: {
  realtimeStatus: RealtimeConnectionStatus;
  adminRole: AdminRole | null;
  features: FeatureFlags;
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
      <CommercialReadinessSection realtimeStatus={realtimeStatus} adminRole={adminRole} />
      <RolePermissionGuide />
      {features.print_agent ? <PrintAgentDeliveryGuide /> : null}
      {features.print_agent ? <PrintAgentStatusSection /> : null}
      {features.data_backup && adminRole === 'admin' ? (
        <DataBackupSection />
      ) : features.data_backup ? (
        <AdminSection title="数据备份">
          <div className="admin-panel-card">
            <Database size={24} />
            <div>
              <h2>仅限管理员</h2>
              <p>数据备份导出功能仅对管理员账户开放。如需备份，请联系管理员操作。</p>
            </div>
          </div>
        </AdminSection>
      ) : null}
    </AdminSection>
  );
}

function CommercialReadinessSection({
  realtimeStatus,
  adminRole,
}: {
  realtimeStatus: RealtimeConnectionStatus;
  adminRole: AdminRole | null;
}) {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<{
    settingsReady: boolean;
    contactReady: boolean;
    menuCount: number;
    itemCount: number;
    tableCount: number;
    paymentReady: boolean;
    aiReady: boolean;
  }>({
    settingsReady: false,
    contactReady: false,
    menuCount: 0,
    itemCount: 0,
    tableCount: 0,
    paymentReady: false,
    aiReady: false,
  });

  const loadReadiness = async () => {
    setLoading(true);
    try {
      const [settings, menu, tables] = await Promise.all([
        getRestaurantSettings().catch(() => null),
        getPublicMenu().catch(() => []),
        fetchRestaurantTables().catch(() => []),
      ]);
      const itemCount = menu.reduce((total, group) => total + group.items.length, 0);
      setSummary({
        settingsReady: Boolean(settings?.name_zh || settings?.name_en || settings?.name_el),
        contactReady: Boolean(settings?.phone || settings?.whatsapp_url || settings?.instagram_url || settings?.map_url),
        menuCount: menu.length,
        itemCount,
        tableCount: tables.filter((table) => table.is_active).length,
        paymentReady: settings?.accept_cash_payment !== false || settings?.accept_pos_payment !== false,
        aiReady: false,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReadiness();
  }, []);

  const checklist = [
    {
      title: '餐馆资料',
      ok: summary.settingsReady,
      text: summary.settingsReady ? '已填写餐馆名称' : '建议先在餐馆设置填写名称、地址和营业时间',
    },
    {
      title: '联系方式',
      ok: summary.contactReady,
      text: summary.contactReady ? '已配置电话/社交/地图入口' : '建议补充电话、WhatsApp、Instagram 或地图链接',
    },
    {
      title: '菜单数据',
      ok: summary.menuCount > 0 && summary.itemCount > 0,
      text: `${summary.menuCount} 个分类，${summary.itemCount} 道前台可见菜品`,
    },
    {
      title: '桌台二维码',
      ok: summary.tableCount > 0,
      text: summary.tableCount > 0 ? `${summary.tableCount} 张启用桌台` : '扫码点餐需要至少创建一张桌台',
    },
    {
      title: '付款方式',
      ok: summary.paymentReady,
      text: summary.paymentReady ? '现金/POS 至少启用一种' : '请至少启用一种顾客付款方式',
    },
    {
      title: '实时连接',
      ok: realtimeStatus === 'connected',
      text: realtimeStatus === 'connected' ? '后台实时订单连接正常' : '请保持后台在线，若断开请刷新页面',
    },
  ];

  const readyCount = checklist.filter((item) => item.ok).length;

  return (
    <AdminSection title="商业交付检查" onRefresh={loadReadiness}>
      <div className="readiness-hero">
        <div>
          <strong>{loading ? '检查中…' : `${readyCount} / ${checklist.length} 项已就绪`}</strong>
          <span>用于新客户上线前确认：资料、菜单、桌台、付款、实时订单和账号权限。</span>
        </div>
        <span className={`readiness-score ${readyCount === checklist.length ? 'is-ok' : 'is-warn'}`}>
          {readyCount === checklist.length ? '可演示' : '待完善'}
        </span>
      </div>
      <div className="readiness-grid">
        {checklist.map((item) => (
          <div className={`readiness-card ${item.ok ? 'is-ok' : 'is-warn'}`} key={item.title}>
            {item.ok ? <CheckCircle2 size={18} /> : <Clock3 size={18} />}
            <div>
              <strong>{item.title}</strong>
              <span>{item.text}</span>
            </div>
          </div>
        ))}
      </div>
      <p className="readiness-note">
        当前账号角色：{adminRole === 'admin' ? '管理员' : adminRole === 'staff' ? '员工' : adminRole === 'kitchen' ? '厨房只读' : '未识别'}。正式交付前建议用测试桌码完成一次扫码下单、后台收款、清桌和打印助手测试。
      </p>
    </AdminSection>
  );
}

function RolePermissionGuide() {
  const roles = [
    { role: '老板 / 管理员', scope: '餐馆设置、菜单、桌台二维码、数据备份、归档删除、员工账号管理' },
    { role: '前台员工', scope: '查看订单、POS 点单、确认收款、清桌、查看打印状态' },
    { role: '厨房', scope: '只读查看订单和小票预览，不开放收款、清桌、菜单、桌台和系统设置' },
  ];

  return (
    <AdminSection title="员工权限建议">
      <div className="role-guide-grid">
        {roles.map((item) => (
          <div className="role-guide-card" key={item.role}>
            <strong>{item.role}</strong>
            <span>{item.scope}</span>
          </div>
        ))}
      </div>
      <p className="admin-message-muted">
        说明：当前数据库支持 admin / staff / kitchen 三类角色。厨房账号是只读订单屏；更细分的权限，例如“只允许改制作状态”，可作为后续专项扩展。
      </p>
    </AdminSection>
  );
}

function PrintAgentDeliveryGuide() {
  return (
    <AdminSection title="本地自动打印助手">
      <div className="print-agent-guide">
        <div>
          <Printer size={22} />
          <strong>适合前台电脑 / Windows 平板</strong>
          <span>安装 YANLCPrintAgent 后，程序会监听新订单并自动打印厨房小票。电脑关机、程序关闭或网络断开时不会自动打印。</span>
        </div>
        <ol>
          <li>先安装打印机驱动，并确认 Windows 测试页能打印。</li>
          <li>运行 YANLC 打印助手设置，填写 Supabase、后台账号和打印机。</li>
          <li>点击测试打印，确认小票纸宽和打印机正确。</li>
          <li>启动自动打印，并按需要设置开机自启。</li>
        </ol>
      </div>
      <p className="admin-message-muted">
        厨房小票只用于后厨出餐，不是希腊税务正式发票；正式收据仍由餐馆原收银机/POS 开具。
      </p>
    </AdminSection>
  );
}

function PrintAgentStatusSection() {
  const [status, setStatus] = useState<PrintAgentStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = async () => {
    setLoading(true);
    setError(null);
    try {
      setStatus(await fetchPrintAgentStatus());
    } catch (err) {
      setError(formatUnknownError(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const lastSeen = status?.last_seen_at ? new Date(status.last_seen_at).getTime() : 0;
  const online = lastSeen > 0 && Date.now() - lastSeen < 90_000 && status?.status !== 'error';

  return (
    <AdminSection title="打印助手状态" onRefresh={loadStatus}>
      <div className="print-agent-status-grid">
        <div className={`print-agent-status-card ${online ? 'is-ok' : status?.status === 'error' ? 'is-error' : 'is-warn'}`}>
          <Printer size={22} />
          <div>
            <strong>{loading ? '检查中…' : online ? '打印助手在线' : status ? '打印助手未在线' : '未启用状态回传'}</strong>
            <span>{status?.agent_name ?? 'YANLCPrintAgent'}</span>
          </div>
        </div>
        <div className="print-agent-status-card">
          <Clock3 size={22} />
          <div>
            <strong>最后在线</strong>
            <span>{status?.last_seen_at ? new Date(status.last_seen_at).toLocaleString('zh-CN') : '暂无记录'}</span>
          </div>
        </div>
        <div className="print-agent-status-card">
          <CheckCircle2 size={22} />
          <div>
            <strong>最后打印</strong>
            <span>{status?.last_printed_at ? new Date(status.last_printed_at).toLocaleString('zh-CN') : '暂无记录'}</span>
          </div>
        </div>
        <div className={`print-agent-status-card ${status?.last_error ? 'is-error' : ''}`}>
          <Activity size={22} />
          <div>
            <strong>最近错误</strong>
            <span>{status?.last_error || '暂无错误'}</span>
          </div>
        </div>
      </div>
      {error ? <p className="admin-message admin-message-danger">读取打印助手状态失败：{error}</p> : null}
      {!status && !loading ? <p className="admin-message-muted">如需显示在线状态，请先给客户数据库执行打印助手状态补丁，并升级本地打印助手。</p> : null}
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
  const deepseekOk = health?.checks?.deepseek === 'configured';
  const openaiOk = health?.checks?.openai_images === 'configured';
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
        <div className={`health-check-card ${deepseekOk ? 'is-ok' : 'is-warn'}`}>
          <ChefHat size={20} />
          <div>
            <strong>菜单 AI</strong>
            <span>{loading ? '检查中…' : deepseekOk ? 'DeepSeek 已配置' : '未配置 DeepSeek Key'}</span>
          </div>
        </div>
        <div className={`health-check-card ${openaiOk ? 'is-ok' : 'is-warn'}`}>
          <Activity size={20} />
          <div>
            <strong>AI 图片</strong>
            <span>{loading ? '检查中…' : openaiOk ? 'OpenAI 图片已配置' : '未配置 OpenAI Key'}</span>
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
    { key: 'legal_settings', label: '法律设置' },
    { key: 'legal_settings_versions', label: '法律版本' },
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
          归档分类
        </button>
      </div>
    </div>
  );
}

function CategoryForm({
  value, onChange,
}: {
  value: Partial<MenuCategory>;
  onChange: (value: Partial<MenuCategory>) => void;
}) {
  return (
    <div className="category-form-panel">
      <div className="category-form-main">
        <TextField label="中文" value={value.name_zh} onChange={(v) => onChange({ ...value, name_zh: v })} />
        <TextField label="英文" value={value.name_en} onChange={(v) => onChange({ ...value, name_en: v })} />
        <TextField label="希腊语" value={value.name_el} onChange={(v) => onChange({ ...value, name_el: v })} />
        <TextField label="排序" value={value.sort_order} type="number" onChange={(v) => onChange({ ...value, sort_order: Number(v) })} />
        <label className="checkbox-label category-active-toggle"><input checked={Boolean(value.is_active)} type="checkbox" onChange={(event) => onChange({ ...value, is_active: event.target.checked })} />启用</label>
      </div>
    </div>
  );
}

function ItemRow({
  item, categories, selected, onSelect, onMessage, onSave, onDuplicate, onDelete, toast, features,
}: {
  item: MenuItem; categories: MenuCategory[]; selected: boolean;
  onSelect: (checked: boolean) => void; onMessage: (value: string | null) => void;
  onSave: (item: Partial<MenuItem>) => Promise<boolean>; onDuplicate: (item: MenuItem) => void; onDelete: (item: MenuItem) => void;
  toast: (msg: string, type?: 'success' | 'error' | 'warning') => void;
  features: FeatureFlags;
}) {
  const [value, setValue] = useState<Partial<MenuItem>>(item);
  const [editing, setEditing] = useState(false);
  const category = categories.find((entry) => entry.id === item.category_id);

  async function saveAndClose() {
    const saved = await onSave(value);
    if (saved) setEditing(false);
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
          <button className="danger-text" type="button" onClick={() => onDelete(item)}><Trash2 size={14} />隐藏</button>
        </div>
      </div>
      {editing ? (
        <div className="item-row-editor">
          <ItemForm
            value={value}
            categories={categories}
            onChange={setValue}
            onToast={toast}
            enableAiMenu={features.ai_menu}
            enableAiImage={features.ai_image}
          />
          <div className="item-editor-actions">
            <button className="primary-button" type="button" onClick={() => { void saveAndClose(); }}>保存修改</button>
            <button className="secondary-button" type="button" onClick={() => { setValue(item); setEditing(false); }}>取消编辑</button>
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
  value, categories, onChange, onToast, enableAiMenu = true, enableAiImage = true,
}: {
  value: Partial<MenuItem>; categories: MenuCategory[];
  onChange: (value: Partial<MenuItem>) => void;
  onToast?: (msg: string, type?: 'success' | 'error' | 'warning') => void;
  enableAiMenu?: boolean;
  enableAiImage?: boolean;
}) {
  const [uploading, setUploading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiImagePrompt, setAiImagePrompt] = useState('');
  const [aiImageLoading, setAiImageLoading] = useState(false);
  const selectedCategory = categories.find((category) => category.id === value.category_id);
  const selectedCategoryName = selectedCategory?.name_zh || selectedCategory?.name_en || selectedCategory?.name_el || '';

  async function handleAiCompleteDescriptions() {
    try {
      setAiLoading(true);
      const completion = await requestMenuAiCompletion(value, selectedCategoryName);
      onChange(mergeMissingAiMenuContent(value, completion));
      setAiImagePrompt(completion.image_prompt || '');
      onToast?.('AI 已补全空白菜单内容，并生成图片提示词');
    } catch (error) {
      onToast?.(formatUnknownError(error), 'error');
    } finally {
      setAiLoading(false);
    }
  }

  async function handleAiGenerateImage() {
    try {
      setAiImageLoading(true);
      let prompt = aiImagePrompt.trim();
      let nextValue = value;
      if (!prompt) {
        const completion = await requestMenuAiCompletion(value, selectedCategoryName);
        nextValue = mergeMissingAiMenuContent(value, completion);
        onChange(nextValue);
        prompt = completion.image_prompt || '';
        setAiImagePrompt(prompt);
      }
      if (!prompt) throw new Error('请先生成或填写图片提示词');
      const file = await requestMenuAiImage(prompt);
      const url = await uploadMenuItemImage(file, value.id);
      onChange({ ...nextValue, image_url: url });
      onToast?.('AI 图片已生成并上传');
    } catch (error) {
      onToast?.(formatUnknownError(error), 'error');
    } finally {
      setAiImageLoading(false);
    }
  }

  return (
    <div className="item-editor-grid">
      <section className="item-editor-card item-editor-core">
        <div className="item-editor-card-head">
          <strong>基础信息</strong>
        </div>
        <div className="item-basic-grid">
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
          <div className="item-image-field item-basic-image">
            <TextField label="图片 URL" value={value.image_url} onChange={(v) => onChange({ ...value, image_url: v })} />
            <div className="item-image-tools">
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
          </div>
        </div>
      </section>

      <section className="item-editor-card item-language-section">
        <div className="item-editor-card-head">
          <strong>多语言内容</strong>
        </div>
        <div className="item-language-grid">
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
        {enableAiMenu || enableAiImage ? <div className="item-ai-panel">
          <div className="item-ai-head">
            <div>
              <strong>AI 辅助</strong>
              <small>输入一个菜名后，可自动补英文/希腊语、三语描述和图片提示词。已有内容不会被自动覆盖。</small>
            </div>
            <div className="item-ai-actions">
              {enableAiMenu ? <button className="secondary-button" type="button" disabled={aiLoading || aiImageLoading} onClick={() => { void handleAiCompleteDescriptions(); }}>
                {aiLoading ? '生成中…' : 'AI 补全菜单内容'}
              </button> : null}
              {enableAiImage ? <button className="secondary-button" type="button" disabled={aiLoading || aiImageLoading} onClick={() => { void handleAiGenerateImage(); }}>
                {aiImageLoading ? '生成图片中…' : 'AI 生成图片'}
              </button> : null}
            </div>
          </div>
          {enableAiImage ? <label className="item-ai-prompt">
            图片提示词
            <textarea
              className="text-field"
              rows={3}
              value={aiImagePrompt}
              placeholder="点击 AI 补全菜单内容后会生成图片提示词；后续配置 OPENAI_API_KEY 后可直接生成图片。"
              onChange={(event) => setAiImagePrompt(event.target.value)}
            />
          </label> : null}
        </div> : null}
      </section>

      <section className="item-editor-card item-options-section">
        <div className="item-editor-card-head">
          <strong>口味选项</strong>
        </div>

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
      </section>
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

type POSLastOrder = {
  orderNumber: number;
  tableLabel: string;
  paymentMethod: 'cash' | 'pos' | null;
  createdAt: string;
  total: number;
  lines: POSCartEntry[];
};

function posEntryKey(menuItemId: string, options: SelectedOption[]) {
  return `${menuItemId}::${JSON.stringify(options)}`;
}

function POSTab({ toast, requestSync, soundEnabled, onOpenOrders, restaurantName }: { toast: (msg: string, type?: 'success' | 'error' | 'warning') => void; requestSync: () => void; soundEnabled: boolean; onOpenOrders: () => void; restaurantName: string; }) {
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [selectedTableId, setSelectedTableId] = useState<string>('');
  const [groups, setGroups] = useState<MenuGroup[]>([]);
  const [cart, setCart] = useState<POSCartEntry[]>([]);
  const [orderType, setOrderType] = useState<'dine_in' | 'takeaway'>('dine_in');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'pos' | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [lastOrder, setLastOrder] = useState<POSLastOrder | null>(null);
  const [printQueued, setPrintQueued] = useState(false);
  const [autoPrintReceipt, setAutoPrintReceipt] = useState(false);
  const [optionsItem, setOptionsItem] = useState<MenuItem | null>(null);
  const [optionsPicked, setOptionsPicked] = useState<Record<string, string | string[]>>({});
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [clearCartConfirmOpen, setClearCartConfirmOpen] = useState(false);
  const { confirm, dialog } = useAdminConfirm();
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchRestaurantTables().then(setTables).catch(() => {});
    getPublicMenu().then(setGroups).catch(() => {});
    try { setAutoPrintReceipt(localStorage.getItem('restaurant_pos_auto_print_receipt') === '1'); } catch { /* noop */ }
  }, []);

  useEffect(() => {
    if (!lastOrder || !printQueued) return;
    setPrintQueued(false);
    window.setTimeout(() => window.print(), 80);
  }, [lastOrder, printQueued]);

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

  const selectedTable = tables.find((table) => table.id === selectedTableId);

  function getPaymentLabel(method: 'cash' | 'pos' | null) {
    if (method === 'cash') return '现金';
    if (method === 'pos') return 'POS / 刷卡';
    return '未付款';
  }

  function getCurrentOrderLabel(type: 'dine_in' | 'takeaway', table?: RestaurantTable) {
    if (type === 'takeaway') return '外带';
    return table ? `${table.table_number} 号桌` : '堂食 · 未指定桌号';
  }

  function printPOSReceipt() {
    if (!lastOrder) return;
    window.setTimeout(() => window.print(), 80);
  }

  function togglePOSAutoPrint(next: boolean) {
    setAutoPrintReceipt(next);
    try { localStorage.setItem('restaurant_pos_auto_print_receipt', next ? '1' : '0'); } catch { /* noop */ }
  }

  function addToCart(item: MenuItem, selectedOptions: SelectedOption[] = []) {
    setLastOrder(null);
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
    if (paymentMethod) {
      const confirmed = await confirm({
        title: '\u786e\u8ba4\u5df2\u6536\u6b3e',
        message: `\u5f53\u524d\u9009\u62e9\u4e86\u201c${getPaymentLabel(paymentMethod)}\u201d\u3002\u63d0\u4ea4\u540e\u8ba2\u5355\u4f1a\u6309\u5df2\u4ed8\u6b3e\u7edf\u8ba1\uff0c\u786e\u8ba4\u5df2\u7ecf\u6536\u6b3e\u4e86\u5417\uff1f`,
        confirmLabel: '\u786e\u8ba4\u63d0\u4ea4',
      });
      if (!confirmed) return;
    }
    try {
      setSubmitting(true);
      const submittedPaymentMethod = paymentMethod;
      const submittedTableLabel = getCurrentOrderLabel(orderType, selectedTable);
      const submittedCart = cart.map((entry) => ({ ...entry, selectedOptions: [...entry.selectedOptions] }));
      const submittedTotal = submittedCart.reduce((sum, entry) => sum + entry.price * entry.quantity, 0);
      const items = cart.map((e) => ({ menu_item_id: e.menuItemId, quantity: e.quantity, selected_options: e.selectedOptions, note: '' }));
      const result = await posSubmitOrder(selectedTableId || null, items, undefined, paymentMethod, orderType);
      const receipt = {
        orderNumber: result.order_number,
        tableLabel: submittedTableLabel,
        paymentMethod: submittedPaymentMethod,
        createdAt: new Date().toISOString(),
        total: submittedTotal,
        lines: submittedCart,
      };
      setLastOrder(receipt);
      setPrintQueued(autoPrintReceipt);
      toast(`POS 订单 #${result.order_number} 已提交（${getPaymentLabel(submittedPaymentMethod)}）`);
      setCart([]);
      setPaymentMethod(null);
      requestSync();
      if (soundEnabled) playOrderNotification();
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
        <h2>当前点单{orderType === 'takeaway' ? ' · 外带' : selectedTableId ? ` · ${selectedTable?.table_number ?? '?'} 号桌` : ' · 堂食'}</h2>
        {lastOrder ? (
          <section className="pos-success-card" role="status">
            <div>
              <CheckCircle2 size={22} />
              <span>
                <strong>订单创建成功</strong>
                <small>#{lastOrder.orderNumber} · {lastOrder.tableLabel} · {getPaymentLabel(lastOrder.paymentMethod)}</small>
              </span>
            </div>
            <div className="pos-success-actions">
              <button className="secondary-button" type="button" onClick={() => { requestSync(); onOpenOrders(); }}>查看订单</button>
              <button className="secondary-button" type="button" onClick={() => { setCart([]); setLastOrder(null); }}>继续点单</button>
              <button className="secondary-button" type="button" onClick={printPOSReceipt}><Printer size={14} />重新打印小票</button>
            </div>
          </section>
        ) : null}
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
              <label className={`pos-pay-opt${autoPrintReceipt ? ' selected' : ''}`}>
                <input type="checkbox" checked={autoPrintReceipt} onChange={(e) => togglePOSAutoPrint(e.target.checked)} />自动打印
              </label>
            </div>
            <LegalSubmissionNotice className="pos-legal-notice" />
            <div className="pos-cart-actions">
              <button className="secondary-button" onClick={() => setClearCartConfirmOpen(true)} disabled={submitting || cart.length === 0}>清空</button>
              <button className="primary-button" disabled={cart.length === 0 || submitting} onClick={submitPOS}>{submitting ? '提交中...' : '提交订单'}</button>
            </div>
          </>
        )}
      </aside>

      {optionsItem ? (
        <div className="cart-note-backdrop pos-options-backdrop" onClick={() => { setOptionsItem(null); setOptionsError(null); }}>
          <div className="cart-note-panel options-panel pos-options-panel" onClick={(e) => e.stopPropagation()}>
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

      {clearCartConfirmOpen ? (
        <div className="print-confirm-overlay" onClick={() => setClearCartConfirmOpen(false)}>
          <div className="print-confirm-dialog" onClick={(event) => event.stopPropagation()}>
            <h3>清空购物车</h3>
            <p>确定要清空当前 POS 购物车吗？已选择的菜品和口味选项会被移除。</p>
            <div className="print-confirm-actions">
              <button className="secondary-button" type="button" onClick={() => setClearCartConfirmOpen(false)}>取消</button>
              <button
                className="primary-button"
                type="button"
                onClick={() => {
                  setCart([]);
                  setClearCartConfirmOpen(false);
                }}
              >
                确认清空
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {dialog}

      {lastOrder ? (
        <section className="pos-print-receipt" aria-hidden="true">
          <h1>{restaurantName || '餐馆'}</h1>
          <div className="receipt-meta">
            <span>订单号</span><strong>#{lastOrder.orderNumber}</strong>
            <span>类型</span><strong>{lastOrder.tableLabel}</strong>
            <span>时间</span><strong>{new Date(lastOrder.createdAt).toLocaleString('zh-CN')}</strong>
            <span>付款</span><strong>{getPaymentLabel(lastOrder.paymentMethod)}</strong>
          </div>
          <div className="receipt-lines">
            {lastOrder.lines.map((line) => (
              <div className="receipt-line" key={posEntryKey(line.menuItemId, line.selectedOptions)}>
                <strong>{line.nameZh || line.nameEn || line.nameEl || line.menuItemId}</strong>
                {line.selectedOptions.length > 0 ? (
                  <small>{line.selectedOptions.map((option) => option.choice_name_zh || option.choice_name_en || option.choice_name_el).join('、')}</small>
                ) : null}
                <span>{line.quantity} x {formatPrice(line.price)}</span>
                <b>{formatPrice(line.price * line.quantity)}</b>
              </div>
            ))}
          </div>
          <div className="receipt-total"><span>总价</span><strong>{formatPrice(lastOrder.total)}</strong></div>
          <p className="receipt-thanks">谢谢惠顾</p>
        </section>
      ) : null}
    </main>
  );
}

