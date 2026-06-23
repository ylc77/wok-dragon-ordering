import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Ban, Banknote, CreditCard, Minus, Plus, ReceiptText, ShoppingBag, Trash2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { MenuCard } from './MenuPage';
import { SafeImage } from '../components/SafeImage';
import { playSuccessSound } from '../lib/audio';
import { getPublicMenu, getRestaurantSettings, requireAnonymousSession } from '../lib/menuApi';
import { hasSupabaseConfig } from '../lib/supabase';
import { formatPrice, getLocalizedField } from '../lib/localized';
import {
  addCartItem,
  enterTableSession,
  fetchCart,
  fetchLatestTableReentryRequest,
  fetchSessionOrders,
  fetchTableEntryState,
  removeCartItem,
  requestBill,
  requestTableReentry,
  resumeTableSession,
  submitOrder,
  subscribeToTableCart,
  subscribeToTableReentryRequest,
  updateCartItemQuantity,
} from '../lib/orderApi';
import type { BillPaymentMethod, CartItem, Language, MenuGroup, MenuItem, MenuItemOptionGroup, Order, RealtimeConnectionStatus, RestaurantSettings, SelectedOption, TableEntryState, TableReentryRequest, TableSessionState } from '../lib/types';
import { LanguageSwitch } from '../components/LanguageSwitch';

export function TableOrderPage() {
  const { qrToken = '' } = useParams();
  const { t, i18n } = useTranslation();
  const lang: Language = i18n.language?.startsWith('zh') ? 'zh' : i18n.language?.startsWith('en') ? 'en' : 'el';
  const [groups, setGroups] = useState<MenuGroup[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [sessionInfo, setSessionInfo] = useState<TableSessionState | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  function sanitizeError(err: unknown): string {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('menu item is unavailable')) return t('common.unavailable');
    if (msg.includes('quantity cannot exceed')) return msg;
    if (msg.includes('quantity must be greater than zero')) return msg;
    if (msg.includes('not a participant')) return t('order.sessionEnded');
    if (msg.includes('cart is empty')) return t('order.cartEmpty');
    if (msg.includes('active table session')) return t('order.sessionEnded');
    return t('common.unavailable');
  }

  const [submitting, setSubmitting] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [billOpen, setBillOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<BillPaymentMethod | null>(null);
  const [requestingBill, setRequestingBill] = useState(false);
  const [optionsItem, setOptionsItem] = useState<MenuItem | null>(null);
  const [optionsPicked, setOptionsPicked] = useState<Record<string, string | string[]>>({});
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [billOrders, setBillOrders] = useState<Order[]>([]);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [entryState, setEntryState] = useState<TableEntryState | null>(null);
  const [enteringSession, setEnteringSession] = useState(false);
  const [reentryRequest, setReentryRequest] = useState<TableReentryRequest | null>(null);
  const [requestingReentry, setRequestingReentry] = useState(false);
  const cartRefreshSequence = useRef(0);
  const [cartSound, setCartSound] = useState(() => {
    try {
      const v = localStorage.getItem('restaurant:cart-sound');
      if (v !== null) return v !== '0';
      // 迁移旧 key
      const old = localStorage.getItem('wok-dragon:cart-sound');
      if (old !== null) { localStorage.setItem('restaurant:cart-sound', old); localStorage.removeItem('wok-dragon:cart-sound'); return old !== '0'; }
      return true;
    } catch { return true; }
  });
  const toggleCartSound = () => {
    setCartSound((prev) => {
      const next = !prev;
      try { localStorage.setItem('restaurant:cart-sound', next ? '1' : '0'); } catch { /* noop */ }
      return next;
    });
  };
  const categoryNavRef = useRef<HTMLElement>(null);
  const menuGroupsRef = useRef<HTMLDivElement>(null);
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [orderingEnabled, setOrderingEnabled] = useState(true);
  const [restaurantSettings, setRestaurantSettings] = useState<RestaurantSettings | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeConnectionStatus>('connecting');
  const restaurantName = restaurantSettings
    ? getLocalizedField(lang, {
        zh: restaurantSettings.name_zh,
        en: restaurantSettings.name_en,
        el: restaurantSettings.name_el,
      })
    : t('home.title');

  useEffect(() => {
    document.title = restaurantName;
  }, [restaurantName]);

  const refreshOrderingStatus = useCallback(async () => {
    const settings = await getRestaurantSettings();
    setRestaurantSettings(settings);
    setOrderingEnabled(settings?.ordering_enabled ?? true);
  }, []);

  const refreshCart = useCallback(async (sessionId: string) => {
    const requestSequence = ++cartRefreshSequence.current;
    const rows = await fetchCart(sessionId);
    if (requestSequence === cartRefreshSequence.current) {
      setCart(rows);
    }
    return rows;
  }, []);

  const refreshOrders = useCallback(async (sessionId: string) => {
    const rows = await fetchSessionOrders(sessionId);
    setBillOrders(rows);
    return rows;
  }, []);

  const refreshSession = useCallback(async (sessionId: string, includeCart = true) => {
    const [nextSession] = await Promise.all([
      resumeTableSession(sessionId, qrToken),
      refreshOrders(sessionId),
    ]);
    setSessionInfo(nextSession);
    setSessionEnded(nextSession.session_status === 'closed');
    if (nextSession.session_status === 'closed') {
      setCart([]);
      setBillOpen(false);
      setPaymentOpen(false);
      setEntryState(await fetchTableEntryState(qrToken));
    } else if (includeCart) {
      await refreshCart(sessionId);
    }
    return nextSession;
  }, [qrToken, refreshCart, refreshOrders]);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      try {
        setLoading(true);
        setMessage(null);
        const menuPromise = getPublicMenu();
        const settingsPromise = getRestaurantSettings();
        void settingsPromise
          .then((settings) => {
            if (!cancelled) {
              setRestaurantSettings(settings);
              setOrderingEnabled(settings?.ordering_enabled ?? true);
            }
          })
          .catch((err) => {
            if (!cancelled) setMessage(sanitizeError(err));
          });

        if (!hasSupabaseConfig) {
          setGroups(await menuPromise);
          setMessage('Supabase is not configured yet.');
          return;
        }

        await requireAnonymousSession();
        const savedSession = readSavedTableSession(qrToken);
        let restored: TableSessionState | null = null;
        let sessionId = savedSession?.session_id ?? null;

        if (sessionId) {
          restored = await resumeTableSession(sessionId, qrToken);
        }

        if (restored?.session_status === 'closed') {
          clearSavedTableSession(qrToken);
          sessionId = null;
          // 保留 restored 对象以便 sessionEnded 状态正确显示结束页
        }
        if (cancelled) return;
        const nextEntryState = restored?.session_status === 'active' ? null : await fetchTableEntryState(qrToken);
        if (cancelled) return;
        setSessionInfo(restored);
        setSessionEnded(restored?.session_status === 'closed');
        setEntryState(nextEntryState);
        const [menuGroups, settings] = await Promise.all([
          menuPromise,
          settingsPromise,
          restored ? refreshOrders(restored.session_id) : Promise.resolve([]),
          restored?.session_status === 'active' ? refreshCart(restored.session_id) : Promise.resolve([]),
        ]);
        if (cancelled) return;
        setGroups(menuGroups);
        setRestaurantSettings(settings);
        setOrderingEnabled(settings?.ordering_enabled ?? true);
      } catch (err) {
        if (!cancelled) setMessage(sanitizeError(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    boot();
    return () => {
      cancelled = true;
    };
  }, [qrToken, refreshCart, refreshOrders]);

  useEffect(() => {
    if (!sessionInfo) return;
    const unsubscribe = subscribeToTableCart(sessionInfo.session_id, () => {
      void refreshCart(sessionInfo.session_id).catch((err) => setMessage(sanitizeError(err)));
      void refreshSession(sessionInfo.session_id, false).catch((err) => setMessage(sanitizeError(err)));
      void refreshOrderingStatus().catch((err) => setMessage(sanitizeError(err)));
    }, setRealtimeStatus);
    const interval = window.setInterval(() => {
      void refreshCart(sessionInfo.session_id).catch((err) => setMessage(sanitizeError(err)));
      void refreshSession(sessionInfo.session_id, true).catch((err) => setMessage(sanitizeError(err)));
      void refreshOrderingStatus().catch((err) => setMessage(sanitizeError(err)));
    }, 5_000);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void refreshCart(sessionInfo.session_id).catch(() => {});
        void refreshSession(sessionInfo.session_id, true).catch(() => {});
        void refreshOrderingStatus().catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
      unsubscribe();
    };
  }, [refreshCart, refreshOrderingStatus, refreshSession, sessionInfo?.session_id]);

  const refreshReentryRequest = useCallback(async () => {
    if (!sessionInfo || sessionInfo.session_status !== 'closed') return;
    const nextRequest = await fetchLatestTableReentryRequest(sessionInfo.session_id);
    setReentryRequest(nextRequest);
    if (nextRequest?.status !== 'approved') return;

    const nextSession = await resumeTableSession(nextRequest.target_session_id, qrToken);
    if (nextSession.session_status !== 'active') return;

    saveTableSession(qrToken, nextSession);
    const [nextCart, nextOrders] = await Promise.all([
      fetchCart(nextSession.session_id),
      fetchSessionOrders(nextSession.session_id),
    ]);
    setSessionInfo(nextSession);
    setSessionEnded(false);
    setReentryRequest(null);
    setCart(nextCart);
    setBillOrders(nextOrders);
    setMessage(null);
  }, [qrToken, sessionInfo]);

  async function activateSession(joined: { session_id: string; table_id: string; table_number: number }) {
    saveTableSession(qrToken, joined);
    const nextSession = await resumeTableSession(joined.session_id, qrToken);
    const [nextCart, nextOrders] = await Promise.all([
      fetchCart(joined.session_id),
      fetchSessionOrders(joined.session_id),
    ]);
    setSessionInfo(nextSession);
    setSessionEnded(false);
    setEntryState(null);
    setReentryRequest(null);
    setCart(nextCart);
    setBillOrders(nextOrders);
    setMessage(null);
  }

  async function enterCurrentSession() {
    if (!entryState) return;
    try {
      setEnteringSession(true);
      setMessage(null);
      const joined = await enterTableSession(
        qrToken,
        entryState.active_session_id,
        !entryState.is_occupied,
      );
      await activateSession(joined);
    } catch (err) {
      setMessage(getErrorMessage(err));
      try {
        setEntryState(await fetchTableEntryState(qrToken));
      } catch {
        // Preserve the original transaction error if refreshing the entry state also fails.
      }
    } finally {
      setEnteringSession(false);
    }
  }

  useEffect(() => {
    if (!reentryRequest?.id || reentryRequest.status !== 'pending') return;
    return subscribeToTableReentryRequest(reentryRequest.id, () => {
      void refreshReentryRequest().catch((err) => setMessage(sanitizeError(err)));
    });
  }, [reentryRequest?.id, reentryRequest?.status, refreshReentryRequest]);

  const cartSummary = useMemo(() => getCartSummary(cart), [cart]);
  const billSummary = useMemo(() => getBillSummary(billOrders), [billOrders]);
  const hasOrders = billOrders.length > 0;
  const orderingLocked = sessionInfo?.bill_request_status === 'requested';
  const cartByMenuItemId = useMemo(() => {
    const rows = new Map<string, CartItem[]>();
    cart.forEach((line) => {
      const list = rows.get(line.menu_item_id) || [];
      list.push(line);
      rows.set(line.menu_item_id, list);
    });
    return rows;
  }, [cart]);
  const visibleGroups = useMemo(() => groups.filter((group) => group.items.length), [groups]);

  useEffect(() => {
    if (!activeCategoryId && visibleGroups.length) setActiveCategoryId(visibleGroups[0].id);
  }, [activeCategoryId, visibleGroups]);

  useEffect(() => {
    const container = menuGroupsRef.current;
    if (!container) return;

    const updateActiveCategory = () => {
      const sections = Array.from(container.querySelectorAll<HTMLElement>('.menu-group'));
      const marker = container.getBoundingClientRect().top + 32;
      const current = sections.reduce(
        (active, section) => (section.getBoundingClientRect().top <= marker ? section : active),
        sections[0],
      );
      if (current) setActiveCategoryId(current.dataset.categoryId ?? null);
    };

    updateActiveCategory();
    container.addEventListener('scroll', updateActiveCategory, { passive: true });
    return () => container.removeEventListener('scroll', updateActiveCategory);
  }, [visibleGroups]);

  useEffect(() => {
    categoryNavRef.current
      ?.querySelector<HTMLElement>(`[data-category-link="${activeCategoryId}"]`)
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [activeCategoryId]);

  function selectCategory(groupId: string) {
    setActiveCategoryId(groupId);
    menuGroupsRef.current
      ?.querySelector<HTMLElement>(`[data-category-id="${groupId}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function addItem(item: MenuItem) {
    if (!sessionInfo) return;
    if (!orderingEnabled) {
      setMessage(t('order.orderingPausedText'));
      return;
    }
    if (orderingLocked) {
      setMessage(t('order.billOrderingLocked'));
      return;
    }
    // 有选项 → 弹窗选择
    if (item.options && item.options.length > 0) {
      const initial: Record<string, string | string[]> = {};
      for (const g of item.options) {
        initial[g.id] = g.type === 'multiple' ? [] : '';
      }
      setOptionsPicked(initial);
      setOptionsError(null);
      setOptionsItem(item);
      return;
    }
    // 无选项 → 直接加购
    try {
      await addCartItem(sessionInfo.session_id, item.id, 1, '', []);
      await refreshCart(sessionInfo.session_id);
      if (cartSound) playSuccessSound();
    } catch (err) {
      setMessage(sanitizeError(err));
    }
  }

  function toggleSingleOption(groupId: string, choiceId: string) {
    setOptionsPicked((prev) => ({ ...prev, [groupId]: prev[groupId] === choiceId ? '' : choiceId }));
    setOptionsError(null);
  }

  function toggleMultiOption(groupId: string, choiceId: string) {
    setOptionsPicked((prev) => {
      const current = (prev[groupId] as string[]) || [];
      const next = current.includes(choiceId)
        ? current.filter((id) => id !== choiceId)
        : [...current, choiceId];
      return { ...prev, [groupId]: next };
    });
    setOptionsError(null);
  }

  async function confirmOptions() {
    if (!optionsItem || !sessionInfo) return;
    const groups = optionsItem.options ?? [];
    // 检查必选
    for (const g of groups) {
      if (!g.required) continue;
      const picked = optionsPicked[g.id];
      if (!picked || (Array.isArray(picked) && picked.length === 0)) {
        setOptionsError('请完成所有必选项');
        return;
      }
    }
    // 构建 selected_options
    const selected: SelectedOption[] = [];
    for (const g of groups) {
      const picked = optionsPicked[g.id];
      if (!picked || (Array.isArray(picked) && picked.length === 0)) continue;
      const choiceIds = Array.isArray(picked) ? picked : [picked];
      for (const cid of choiceIds) {
        const choice = g.choices.find((c) => c.id === cid);
        if (!choice) continue;
        selected.push({
          group_id: g.id,
          group_name_zh: g.name_zh,
          group_name_en: g.name_en,
          group_name_el: g.name_el,
          choice_id: choice.id,
          choice_name_zh: choice.name_zh,
          choice_name_en: choice.name_en,
          choice_name_el: choice.name_el,
        });
      }
    }
    try {
      await addCartItem(sessionInfo.session_id, optionsItem.id, 1, '', selected);
      await refreshCart(sessionInfo.session_id);
      if (cartSound) playSuccessSound();
      setOptionsItem(null);
      setOptionsPicked({});
    } catch (err) {
      setMessage(sanitizeError(err));
    }
  }

  async function updateQuantity(line: CartItem, nextQuantity: number) {
    if (!sessionInfo) return;
    if (orderingLocked) {
      setMessage(t('order.billOrderingLocked'));
      return;
    }
    if (!orderingEnabled && nextQuantity >= line.quantity) {
      setMessage(t('order.orderingPausedText'));
      return;
    }
    if (nextQuantity >= line.quantity && (line.menu_items?.is_sold_out || line.menu_items?.is_available === false)) {
      setMessage(t('order.cartSoldOutIncrease'));
      return;
    }
    try {
      if (nextQuantity <= 0) {
        await removeCartItem(line.id);
      } else {
        await updateCartItemQuantity(line.id, nextQuantity);
      }
      await refreshCart(sessionInfo.session_id);
      if (nextQuantity > 0 && cartSound) playSuccessSound();
    } catch (err) {
      setMessage(sanitizeError(err));
    }
  }

  async function submitCurrentOrder() {
    if (!sessionInfo || cartSummary.isEmpty) return;
    if (!orderingEnabled) {
      setMessage(t('order.orderingPausedText'));
      return;
    }
    if (orderingLocked) {
      setMessage(t('order.billOrderingLocked'));
      return;
    }
    const unavailableInCart = cart.filter(
      (line) => line.menu_items?.is_sold_out || line.menu_items?.is_available === false,
    );
    if (unavailableInCart.length > 0) {
      setMessage(t('order.cartSoldOutPrompt'));
      return;
    }
    try {
      setSubmitting(true);
      const result = await submitOrder(sessionInfo.session_id, crypto.randomUUID());
      setMessage(`${t('order.submitSuccess')} ${t('order.orderNumber')}: ${result.order_number}`);
      await Promise.all([refreshCart(sessionInfo.session_id), refreshOrders(sessionInfo.session_id)]);
      setCartOpen(false);
    } catch (err) {
      setMessage(sanitizeError(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function sendBillRequest(paymentMethod: BillPaymentMethod) {
    if (!sessionInfo) return;
    if (!hasOrders) {
      setMessage(t('order.requestBillRequiresOrder'));
      return;
    }
    if (!cartSummary.isEmpty) {
      setMessage(t('order.billCartPending'));
      return;
    }
    try {
      setRequestingBill(true);
      await requestBill(sessionInfo.session_id, paymentMethod);
      setBillOpen(false);
      setPaymentOpen(false);
      setSelectedPayment(null);
      setMessage(null);
      setSessionInfo((current) => current ? {
        ...current,
        bill_request_status: 'requested',
        bill_payment_method: paymentMethod,
      } : current);
    } catch (err) {
      setMessage(sanitizeError(err));
    } finally {
      setRequestingBill(false);
    }
  }

  async function sendReentryRequest() {
    if (!sessionInfo || sessionInfo.session_status !== 'closed') return;
    try {
      setRequestingReentry(true);
      setMessage(null);
      await requestTableReentry(sessionInfo.session_id, qrToken);
      setReentryRequest(await fetchLatestTableReentryRequest(sessionInfo.session_id));
    } catch (err) {
      setMessage(sanitizeError(err));
    } finally {
      setRequestingReentry(false);
    }
  }

  if (!sessionInfo && entryState) {
    return (
      <main className="order-shell session-ended-shell">
        <section className="session-ended-card table-entry-card">
          <div className="session-brand">
            <SafeImage src={restaurantSettings?.logo_url} className="brand-logo" alt="" fallback={<span className="brand-mark">餐</span>} />
            <strong>{restaurantName}</strong>
          </div>
          <ShoppingBag size={34} />
          <h1>{t('order.entryTitle', { table: entryState.table_number })}</h1>
          <p>{t(entryState.is_occupied ? 'order.entryOccupied' : 'order.entryIdle', { table: entryState.table_number })}</p>
          {message ? <p className="bill-dialog-warning" role="alert">{message}</p> : null}
          <button
            className="primary-button stretch"
            type="button"
            disabled={enteringSession}
            onClick={enterCurrentSession}
          >
            {enteringSession
              ? t('order.enteringTable')
              : t(entryState.is_occupied ? 'order.joinCurrentTable' : 'order.startOrdering')}
          </button>
          <LanguageSwitch />
        </section>
      </main>
    );
  }

  if (sessionEnded && sessionInfo) {
    return (
      <main className="order-shell session-ended-shell">
        <section className="session-ended-card">
          <div className="session-brand">
            <SafeImage src={restaurantSettings?.logo_url} className="brand-logo" alt="" fallback={<span className="brand-mark">餐</span>} />
            <strong>{restaurantName}</strong>
          </div>
          <ReceiptText size={34} />
          <h1>{t('order.sessionEndedTitle')}</h1>
          <p>{t('order.sessionEnded')}</p>
          <button className="primary-button stretch" type="button" onClick={() => { clearSavedTableSession(qrToken); window.location.reload(); }}>
            {t('order.startOrdering')}
          </button>
          <LanguageSwitch />
        </section>
      </main>
    );
  }

  const billRequested = orderingLocked;

  return (
    <main className="order-shell">
      <header className="order-topbar">
        <div className="order-brand">
          <SafeImage src={restaurantSettings?.logo_url} className="brand-logo" alt="" fallback={<span className="brand-mark">餐</span>} />
          <span>
            <strong>{restaurantName}</strong>
            <small>
              {t('order.table')} {sessionInfo?.table_number ?? (loading ? '' : qrToken)}
            </small>
          </span>
        </div>
        <div className="order-top-actions">
          <button
            className="bill-request-button"
            type="button"
            aria-label={t('order.requestBill')}
            onClick={() => {
              if (!billRequested) {
                setMessage(null);
                setSelectedPayment(null);
                setBillOpen(true);
              }
            }}
            disabled={!sessionInfo || billRequested}
          >
            <ReceiptText size={17} />
            <span className="bill-label-full">{t('order.requestBill')}</span>
            <span className="bill-label-short">{t('order.requestBillShort')}</span>
          </button>
          <LanguageSwitch />
        </div>
      </header>
      <section className="order-menu">
        <div className="order-table-banner">
          <div>
            <span>{loading ? t('order.joining') : t('order.table')}</span>
            <strong>{sessionInfo?.table_number ?? qrToken}</strong>
          </div>
          <p>{t('order.liveCart')}</p>
        </div>
        {message ? <p className="admin-message">{message}</p> : null}
        {!orderingEnabled ? (
          <section className="ordering-paused-banner" role="status">
            <Ban size={20} />
            <div><strong>{t('order.orderingPausedTitle')}</strong><p>{t('order.orderingPausedText')}</p></div>
          </section>
        ) : null}
        {realtimeStatus !== 'connected' ? (
          <p className="realtime-customer-status" role="status">
            {t(realtimeStatus === 'connecting' ? 'order.realtimeConnecting' : 'order.realtimeDisconnected')}
          </p>
        ) : null}
        {billRequested ? (
          <section className="bill-request-status" role="status">
            <ReceiptText size={20} />
            <div>
              <strong>{t('order.billRequested')}</strong>
              <p>{t('order.billWaiting')}</p>
            </div>
          </section>
        ) : null}
        <nav ref={categoryNavRef} className="order-category-tabs" id="order-categories" aria-label={t('nav.menu')}>
          {visibleGroups.map((group) => (
              <a
                href={`#order-category-${group.id}`}
                key={group.id}
                data-category-link={group.id}
                className={activeCategoryId === group.id ? 'active' : undefined}
                aria-current={activeCategoryId === group.id ? 'true' : undefined}
                onClick={(event) => {
                  event.preventDefault();
                  selectCategory(group.id);
                }}
              >
                {getLocalizedField(lang, {
                  zh: group.name_zh,
                  en: group.name_en,
                  el: group.name_el,
                })}
              </a>
            ))}
        </nav>
        <div ref={menuGroupsRef} className="order-menu-groups">
          {groups.map((group) =>
            group.items.length ? (
              <section className="menu-group" id={`order-category-${group.id}`} data-category-id={group.id} key={group.id}>
                <h2>
                  {getLocalizedField(lang, {
                    zh: group.name_zh,
                    en: group.name_en,
                    el: group.name_el,
                  })}
                </h2>
                <div className="menu-list order-list">
                  {group.items.map((item) => {
                    const cartLines = cartByMenuItemId.get(item.id);
                    const hasOpts = Boolean(item.options && item.options.length > 0);
                    const totalQty = cartLines ? cartLines.reduce((s, l) => s + l.quantity, 0) : 0;
                    // 有 options 的菜: 传合成行用于显示总数量; 无 options: 传第一行用于数量控件
                    const cartLine = hasOpts
                      ? (totalQty > 0 ? { ...cartLines![0], quantity: totalQty } : undefined)
                      : cartLines?.[0];
                    return (
                      <MenuCard
                        item={item}
                        lang={lang}
                        key={item.id}
                        action={
                          <DishQuantityControl
                            item={item}
                            line={cartLine}
                            disabled={!sessionInfo || billRequested || !orderingEnabled || Boolean(item.is_sold_out)}
                            increaseDisabled={billRequested || !orderingEnabled || Boolean(item.is_sold_out)}
                            decreaseDisabled={billRequested}
                            onAdd={() => addItem(item)}
                            onChange={updateQuantity}
                            addLabel={item.is_sold_out ? t('common.soldOut') : t('order.add')}
                            hasOptions={hasOpts}
                          />
                        }
                      />
                    );
                  })}
                </div>
              </section>
            ) : null,
          )}
        </div>
      </section>

      {cartOpen ? <button className="cart-backdrop" type="button" aria-label={t('order.close')} onClick={() => setCartOpen(false)} /> : null}

      <aside className={`cart-panel ${cartOpen ? 'open' : ''}`} id="shared-cart" aria-hidden={!cartOpen}>
        <div className="cart-panel-head">
          <h2>{t('order.sharedCart')}</h2>
          <button type="button" aria-label={t('order.close')} onClick={() => setCartOpen(false)}>
            <X size={18} />
          </button>
        </div>
        <button
          type="button"
          className="cart-sound-toggle"
          onClick={toggleCartSound}
          aria-label={cartSound ? '关闭操作音效' : '开启操作音效'}
          title={cartSound ? '音效已开启' : '音效已关闭'}
        >
          {cartSound ? '🔔' : '🔕'}
        </button>
        <p className="muted">{t('order.liveCart')}</p>
        {cart.length === 0 ? <p className="muted">{t('order.cartEmpty')}</p> : null}
        {cart.map((line) => {
          const item = line.menu_items;
          return (
            <div className="cart-line" key={line.id}>
              <strong>
                {item
                  ? getLocalizedField(lang, {
                      zh: item.name_zh,
                      en: item.name_en,
                      el: item.name_el,
                    })
                  : line.menu_item_id}
                {item?.is_sold_out || item?.is_available === false ? (
                  <span className="cart-soldout-mark">
                    {item?.is_available === false ? t('order.delisted') : t('common.soldOut')}
                  </span>
                ) : null}
              </strong>
              {line.selected_options && line.selected_options.length > 0 ? (
                <span className="cart-options-text">
                  {line.selected_options
                    .map((opt) => {
                      const choiceName = getLocalizedField(lang, {
                        zh: opt.choice_name_zh,
                        en: opt.choice_name_en,
                        el: opt.choice_name_el,
                      });
                      return choiceName;
                    })
                    .join('、')}
                </span>
              ) : null}
              <strong className="cart-line-subtotal">{formatPrice(Number(line.unit_price) * line.quantity)}</strong>
              <div className="cart-controls">
                <button type="button" disabled={billRequested} onClick={() => updateQuantity(line, line.quantity - 1)}>
                  <Minus size={15} />
                </button>
                <span>{line.quantity}</span>
                <button
                  type="button"
                  disabled={
                    billRequested || !orderingEnabled || Boolean(item?.is_sold_out) || item?.is_available === false
                  }
                  onClick={() => updateQuantity(line, line.quantity + 1)}
                >
                  <Plus size={15} />
                </button>
                <button type="button" disabled={billRequested} onClick={() => updateQuantity(line, 0)}>
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          );
        })}
        <div className="cart-total">
          <span>{t('order.selectedCount', { count: cartSummary.totalQuantity })}</span>
          <strong>{formatPrice(cartSummary.totalPrice)}</strong>
        </div>
        <button
          className="primary-button stretch"
          type="button"
          disabled={cartSummary.isEmpty || submitting || billRequested || !orderingEnabled}
          onClick={submitCurrentOrder}
        >
          {t('order.submit')}
        </button>
      </aside>

      {/* 口味选择弹窗 */}
      {optionsItem ? (
        <div className="cart-note-backdrop" role="presentation" onClick={() => { setOptionsItem(null); setOptionsError(null); }}>
          <div
            className="cart-note-panel options-panel"
            role="dialog"
            aria-modal="true"
            aria-label={t('order.selectOptions')}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="cart-note-head">
              <h3>
                {optionsItem
                  ? getLocalizedField(lang, {
                      zh: optionsItem.name_zh,
                      en: optionsItem.name_en,
                      el: optionsItem.name_el,
                    })
                  : ''}
              </h3>
              <button type="button" onClick={() => { setOptionsItem(null); setOptionsError(null); }} aria-label={t('order.cancel')}>
                <X size={18} />
              </button>
            </div>
            <div className="options-groups">
              {(optionsItem.options ?? []).map((group) => (
                <div className="options-group" key={group.id}>
                  <div className="options-group-head">
                    <strong>{getLocalizedField(lang, { zh: group.name_zh, en: group.name_en, el: group.name_el })}</strong>
                    {group.required ? <span className="options-required">{t('order.optionsRequired')}</span> : null}
                    {group.type === 'multiple' ? <small className="options-hint">（可多选）</small> : null}
                  </div>
                  <div className="options-choices">
                    {group.choices.map((choice) => {
                      const choiceName = getLocalizedField(lang, {
                        zh: choice.name_zh,
                        en: choice.name_en,
                        el: choice.name_el,
                      });
                      const isActive = group.type === 'multiple'
                        ? ((optionsPicked[group.id] as string[]) || []).includes(choice.id)
                        : optionsPicked[group.id] === choice.id;
                      return (
                        <button
                          key={choice.id}
                          type="button"
                          className={`option-chip${isActive ? ' active' : ''}`}
                          onClick={() => group.type === 'multiple'
                            ? toggleMultiOption(group.id, choice.id)
                            : toggleSingleOption(group.id, choice.id)}
                        >
                          {choiceName}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            {optionsError ? <p className="options-error">{optionsError}</p> : null}
            <div className="cart-note-actions">
              <button className="secondary-button" type="button" onClick={() => { setOptionsItem(null); setOptionsError(null); }}>
                {t('order.cancel')}
              </button>
              <button className="primary-button" type="button" onClick={confirmOptions}>
                {t('order.confirmSelection')}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {billOpen ? (
        <div className="bill-dialog-backdrop" role="presentation" onClick={() => setBillOpen(false)}>
          <section
            className="bill-dialog bill-review-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="bill-dialog-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="cart-panel-head">
              <h2 id="bill-dialog-title">{t('order.myBill')}</h2>
              <button type="button" aria-label={t('order.close')} onClick={() => setBillOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <p className="bill-review-intro">{t('order.billReviewIntro')}</p>
            <div className="bill-order-list">
              {billOrders.length === 0 ? <p className="bill-empty">{t('order.billEmpty')}</p> : null}
              {billOrders.map((order) => (
                <section className="bill-order-batch" key={order.id}>
                  <header>
                    <strong>{t('order.orderNumber')} #{order.order_number}</strong>
                    <span>{formatOrderTime(order.created_at, lang)}</span>
                  </header>
                  {(order.order_items ?? []).map((item) => (
                    <div className="bill-order-line" key={item.id}>
                      <span>
                        <b>{item.quantity}×</b>{' '}
                        {getLocalizedField(lang, {
                          zh: item.item_name_zh,
                          en: item.item_name_en,
                          el: item.item_name_el,
                        })}
                        {item.note ? <small>{item.note}</small> : null}
                      </span>
                      <strong>{formatPrice(Number(item.line_total))}</strong>
                    </div>
                  ))}
                </section>
              ))}
            </div>
            <div className="bill-grand-total">
              <span>{t('order.amountDue')}</span>
              <strong>{formatPrice(billSummary.totalPrice)}</strong>
            </div>
            {!cartSummary.isEmpty ? <p className="bill-dialog-warning" role="alert">{t('order.billCartPending')}</p> : null}
            <button
              className="primary-button stretch bill-checkout-button"
              type="button"
              disabled={!hasOrders || !cartSummary.isEmpty || billSummary.totalPrice <= 0}
              onClick={() => {
                setBillOpen(false);
                setSelectedPayment(null);
                setPaymentOpen(true);
              }}
            >
              <CreditCard size={18} />
              {t('order.continueToPayment')}
            </button>
          </section>
        </div>
      ) : null}

      {paymentOpen ? (
        <div className="bill-dialog-backdrop" role="presentation" onClick={() => { setPaymentOpen(false); setSelectedPayment(null); }}>
          <section
            className="bill-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="payment-dialog-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="cart-panel-head">
              <h2 id="payment-dialog-title">{t('order.requestBill')}</h2>
              <button type="button" aria-label={t('order.close')} onClick={() => { setPaymentOpen(false); setSelectedPayment(null); }}>
                <X size={18} />
              </button>
            </div>
            <div className="payment-total">
              <span>{t('order.amountDue')}</span>
              <strong>{formatPrice(billSummary.totalPrice)}</strong>
            </div>
            <p>{t('order.choosePayment')}</p>
            <div className="bill-payment-options">
              {restaurantSettings?.accept_pos_payment !== false ? <button
                type="button"
                className={selectedPayment === 'pos' ? 'selected' : undefined}
                aria-pressed={selectedPayment === 'pos'}
                disabled={requestingBill}
                onClick={() => setSelectedPayment('pos')}
              >
                <CreditCard size={24} />
                <strong>{t('order.cardPayment')}</strong>
              </button> : null}
              {restaurantSettings?.accept_cash_payment !== false ? <button
                type="button"
                className={selectedPayment === 'cash' ? 'selected' : undefined}
                aria-pressed={selectedPayment === 'cash'}
                disabled={requestingBill}
                onClick={() => setSelectedPayment('cash')}
              >
                <Banknote size={24} />
                <strong>{t('order.cashPayment')}</strong>
              </button> : null}
            </div>
            <div className="bill-dialog-actions">
              <button type="button" className="secondary-button" disabled={requestingBill} onClick={() => { setPaymentOpen(false); setSelectedPayment(null); setBillOpen(true); }}>
                {t('order.cancel')}
              </button>
              <button type="button" className="primary-button" disabled={!hasOrders || !selectedPayment || requestingBill || !cartSummary.isEmpty} onClick={() => selectedPayment && sendBillRequest(selectedPayment)}>
                {t('order.confirm')}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      <button
        className={`mobile-cart-bar ${cartSummary.isEmpty ? 'is-empty' : ''}`}
        type="button"
        disabled={cartSummary.isEmpty}
        aria-label={t('order.cartBarSummary', {
          count: cartSummary.totalQuantity,
          total: formatPrice(cartSummary.totalPrice),
        })}
        onClick={() => setCartOpen(true)}
      >
        <span className="mobile-cart-summary">
          <ShoppingBag size={18} />
          {t('order.cartBarSummary', {
            count: cartSummary.totalQuantity,
            total: formatPrice(cartSummary.totalPrice),
          })}
        </span>
      </button>
    </main>
  );
}

export function getCartSummary(cartItems: CartItem[]) {
  const summary = cartItems.reduce(
    (result, item) => {
      const quantity = Number(item.quantity) || 0;
      const unitPrice = Number(item.unit_price) || 0;
      result.totalQuantity += quantity;
      result.totalPrice += quantity * unitPrice;
      return result;
    },
    { totalQuantity: 0, totalPrice: 0 },
  );

  return { ...summary, isEmpty: summary.totalQuantity === 0 };
}

export function getBillSummary(orders: Order[]) {
  return orders.reduce(
    (summary, order) => ({
      orderCount: summary.orderCount + 1,
      totalPrice: summary.totalPrice + (Number(order.total_price) || 0),
    }),
    { orderCount: 0, totalPrice: 0 },
  );
}

function formatOrderTime(value: string, lang: Language) {
  return new Intl.DateTimeFormat(lang === 'el' ? 'el-GR' : 'en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function DishQuantityControl({
  item,
  line,
  disabled,
  increaseDisabled,
  decreaseDisabled,
  onAdd,
  onChange,
  addLabel,
  hasOptions,
}: {
  item: MenuItem;
  line?: CartItem;
  disabled: boolean;
  increaseDisabled: boolean;
  decreaseDisabled: boolean;
  onAdd: () => void;
  onChange: (line: CartItem, nextQuantity: number) => void;
  addLabel: string;
  hasOptions?: boolean;
}) {
  // 有 options → 永远走 onAdd 弹窗选择，不直接增减
  if (hasOptions) {
    const totalQty = line ? line.quantity : 0;
    return (
      <button className="dish-add-button" type="button" onClick={onAdd} disabled={disabled}>
        <Plus size={17} />
        <span>{totalQty > 0 ? `${addLabel} (${totalQty})` : addLabel}</span>
      </button>
    );
  }

  if (!line) {
    return (
      <button className="dish-add-button" type="button" onClick={onAdd} disabled={disabled}>
        <Plus size={17} />
        <span>{addLabel}</span>
      </button>
    );
  }

  return (
    <div className="dish-quantity-control" aria-label={item.name_en ?? item.name_el ?? item.name_zh}>
      <button type="button" disabled={decreaseDisabled} onClick={() => onChange(line, line.quantity - 1)}>
        <Minus size={15} />
      </button>
      <strong>{line.quantity}</strong>
      <button type="button" disabled={increaseDisabled || line.quantity >= 99} onClick={() => onChange(line, line.quantity + 1)}>
        <Plus size={15} />
      </button>
    </div>
  );
}

type SavedTableSession = {
  session_id: string;
  table_id: string;
  table_number: number;
};

function tableSessionStorageKey(qrToken: string) {
  return `restaurant:table-session:${qrToken}`;
}

function readSavedTableSession(qrToken: string): SavedTableSession | null {
  try {
    const key = tableSessionStorageKey(qrToken);
    let raw = window.localStorage.getItem(key);
    // 迁移旧 key
    if (!raw) {
      const oldKey = `wok-dragon:table-session:${qrToken}`;
      const oldRaw = window.localStorage.getItem(oldKey);
      if (oldRaw) { window.localStorage.setItem(key, oldRaw); window.localStorage.removeItem(oldKey); raw = oldRaw; }
    }
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<SavedTableSession>;
    if (typeof value.session_id !== 'string' || typeof value.table_id !== 'string' || typeof value.table_number !== 'number') {
      window.localStorage.removeItem(key);
      return null;
    }
    return value as SavedTableSession;
  } catch {
    window.localStorage.removeItem(tableSessionStorageKey(qrToken));
    return null;
  }
}

function saveTableSession(qrToken: string, session: SavedTableSession) {
  window.localStorage.setItem(tableSessionStorageKey(qrToken), JSON.stringify(session));
}

function clearSavedTableSession(qrToken: string) {
  window.localStorage.removeItem(tableSessionStorageKey(qrToken));
}

function isClosedSessionExpired(closedAt: string | null) {
  if (!closedAt) return false;
  return Date.now() - new Date(closedAt).getTime() >= 24 * 60 * 60 * 1000;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return String(error);
}
