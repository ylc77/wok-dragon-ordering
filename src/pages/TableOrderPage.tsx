import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Banknote, CreditCard, Globe2, Menu, Minus, Plus, ReceiptText, ShoppingBag, Trash2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { MenuCard } from './MenuPage';
import { getPublicMenu, requireAnonymousSession } from '../lib/menuApi';
import { hasSupabaseConfig } from '../lib/supabase';
import { getLocalizedField } from '../lib/localized';
import {
  addCartItem,
  fetchCart,
  hasSubmittedOrders,
  joinTableSession,
  removeCartItem,
  requestBill,
  resumeTableSession,
  submitOrder,
  subscribeToTableCart,
  updateCartItemQuantity,
} from '../lib/orderApi';
import type { BillPaymentMethod, CartItem, Language, MenuGroup, MenuItem, TableSessionState } from '../lib/types';

export function TableOrderPage() {
  const { qrToken = '' } = useParams();
  const { t, i18n } = useTranslation();
  const lang = (i18n.language === 'en' ? 'en' : 'el') as Language;
  const [groups, setGroups] = useState<MenuGroup[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [sessionInfo, setSessionInfo] = useState<TableSessionState | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [billOpen, setBillOpen] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<BillPaymentMethod | null>(null);
  const [requestingBill, setRequestingBill] = useState(false);
  const [hasOrders, setHasOrders] = useState(false);
  const [sessionEnded, setSessionEnded] = useState(false);
  const cartRefreshSequence = useRef(0);
  const categoryNavRef = useRef<HTMLElement>(null);
  const menuGroupsRef = useRef<HTMLDivElement>(null);
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);

  const refreshCart = useCallback(async (sessionId: string) => {
    const requestSequence = ++cartRefreshSequence.current;
    const rows = await fetchCart(sessionId);
    if (requestSequence === cartRefreshSequence.current) {
      setCart(rows);
    }
    return rows;
  }, []);

  const refreshSession = useCallback(async (sessionId: string, includeCart = true) => {
    const [nextSession, orderExists] = await Promise.all([
      resumeTableSession(sessionId, qrToken),
      hasSubmittedOrders(sessionId),
    ]);
    setSessionInfo(nextSession);
    setSessionEnded(nextSession.session_status === 'closed');
    setHasOrders(orderExists);
    if (nextSession.session_status === 'closed') {
      setCart([]);
      setBillOpen(false);
    } else if (includeCart) {
      await refreshCart(sessionId);
    }
    return nextSession;
  }, [qrToken, refreshCart]);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      try {
        setLoading(true);
        setMessage(null);
        const menuPromise = getPublicMenu();

        if (!hasSupabaseConfig) {
          setGroups(await menuPromise);
          setMessage('Supabase is not configured yet.');
          return;
        }

        await requireAnonymousSession();
        const savedSession = readSavedTableSession(qrToken);
        let sessionId = savedSession?.session_id;

        if (!sessionId) {
          const joined = await joinTableSession(qrToken);
          sessionId = joined.session_id;
          saveTableSession(qrToken, joined);
        }

        const restored = await resumeTableSession(sessionId, qrToken);
        if (cancelled) return;
        setSessionInfo(restored);
        setSessionEnded(restored.session_status === 'closed');
        const [menuGroups, orderExists] = await Promise.all([
          menuPromise,
          hasSubmittedOrders(sessionId),
          restored.session_status === 'active' ? refreshCart(sessionId) : Promise.resolve([]),
        ]);
        if (cancelled) return;
        setGroups(menuGroups);
        setHasOrders(orderExists);
      } catch (err) {
        if (!cancelled) setMessage(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    boot();
    return () => {
      cancelled = true;
    };
  }, [qrToken, refreshCart]);

  useEffect(() => {
    if (!sessionInfo) return;
    return subscribeToTableCart(sessionInfo.session_id, () => {
      void refreshCart(sessionInfo.session_id).catch((err) => setMessage(err.message));
      void refreshSession(sessionInfo.session_id, false).catch((err) => setMessage(err.message));
    });
  }, [refreshCart, refreshSession, sessionInfo?.session_id]);

  const cartSummary = useMemo(() => getCartSummary(cart), [cart]);
  const orderingLocked = sessionInfo?.bill_request_status === 'requested';
  const cartByMenuItemId = useMemo(() => {
    const rows = new Map<string, CartItem>();
    cart.forEach((line) => {
      rows.set(line.menu_item_id, line);
    });
    return rows;
  }, [cart]);
  const nextLang = lang === 'el' ? 'en' : 'el';
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
    if (orderingLocked) {
      setMessage(t('order.billOrderingLocked'));
      return;
    }
    try {
      await addCartItem(sessionInfo.session_id, item.id, 1, '');
      await refreshCart(sessionInfo.session_id);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    }
  }

  async function updateQuantity(line: CartItem, nextQuantity: number) {
    if (!sessionInfo) return;
    if (orderingLocked) {
      setMessage(t('order.billOrderingLocked'));
      return;
    }
    try {
      if (nextQuantity <= 0) {
        await removeCartItem(line.id);
      } else {
        await updateCartItemQuantity(line.id, nextQuantity);
      }
      await refreshCart(sessionInfo.session_id);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    }
  }

  async function submitCurrentOrder() {
    if (!sessionInfo || cartSummary.isEmpty) return;
    if (orderingLocked) {
      setMessage(t('order.billOrderingLocked'));
      return;
    }
    try {
      setSubmitting(true);
      const result = await submitOrder(sessionInfo.session_id, crypto.randomUUID());
      setMessage(`${t('order.submitSuccess')} ${t('order.orderNumber')}: ${result.order_number}`);
      await refreshCart(sessionInfo.session_id);
      setCartOpen(false);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
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
    try {
      setRequestingBill(true);
      await requestBill(sessionInfo.session_id, paymentMethod);
      setBillOpen(false);
      setSelectedPayment(null);
      setMessage(null);
      setSessionInfo((current) => current ? {
        ...current,
        bill_request_status: 'requested',
        bill_payment_method: paymentMethod,
      } : current);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setRequestingBill(false);
    }
  }

  if (sessionEnded && sessionInfo) {
    return (
      <main className="order-shell session-ended-shell">
        <section className="session-ended-card">
          <ReceiptText size={34} />
          <h1>{t('order.sessionEndedTitle')}</h1>
          <p>{t('order.sessionEnded')}</p>
          <button className="icon-text-button" type="button" onClick={() => i18n.changeLanguage(nextLang)}>
            <Globe2 size={17} />
            {nextLang.toUpperCase()}
          </button>
        </section>
      </main>
    );
  }

  const billRequested = orderingLocked;

  return (
    <main className="order-shell">
      <header className="order-topbar">
        <div className="order-brand">
          <span className="brand-mark">龙</span>
          <span>
            <strong>Wok Dragon Express</strong>
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
            title={!hasOrders ? t('order.requestBillRequiresOrder') : undefined}
          >
            <ReceiptText size={17} />
            <span>{t('order.requestBill')}</span>
          </button>
          <button className="icon-text-button" type="button" onClick={() => i18n.changeLanguage(nextLang)}>
            <Globe2 size={17} />
            {nextLang.toUpperCase()}
          </button>
          <a className="icon-button" href="#order-categories" aria-label={t('nav.menu')}>
            <Menu size={18} />
          </a>
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
                  {group.items.map((item) => (
                    <MenuCard
                      item={item}
                      lang={lang}
                      key={item.id}
                      action={
                        <DishQuantityControl
                          item={item}
                          line={cartByMenuItemId.get(item.id)}
                          disabled={!sessionInfo || billRequested}
                          onAdd={() => addItem(item)}
                          onChange={updateQuantity}
                          addLabel={t('order.add')}
                        />
                      }
                    />
                  ))}
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
              </strong>
              <strong className="cart-line-subtotal">{formatCartPrice(Number(line.unit_price) * line.quantity)}</strong>
              <div className="cart-controls">
                <button type="button" disabled={billRequested} onClick={() => updateQuantity(line, line.quantity - 1)}>
                  <Minus size={15} />
                </button>
                <span>{line.quantity}</span>
                <button type="button" disabled={billRequested} onClick={() => updateQuantity(line, line.quantity + 1)}>
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
          <strong>{formatCartPrice(cartSummary.totalPrice)}</strong>
        </div>
        <button
          className="primary-button stretch"
          type="button"
          disabled={cartSummary.isEmpty || submitting || billRequested}
          onClick={submitCurrentOrder}
        >
          {t('order.submit')}
        </button>
      </aside>

      {billOpen ? (
        <div className="bill-dialog-backdrop" role="presentation" onClick={() => { setBillOpen(false); setSelectedPayment(null); }}>
          <section
            className="bill-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="bill-dialog-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="cart-panel-head">
              <h2 id="bill-dialog-title">{t('order.requestBill')}</h2>
              <button type="button" aria-label={t('order.close')} onClick={() => { setBillOpen(false); setSelectedPayment(null); }}>
                <X size={18} />
              </button>
            </div>
            <p>{t('order.choosePayment')}</p>
            {!hasOrders ? (
              <p className="bill-dialog-warning" role="alert">
                {t('order.requestBillRequiresOrder')}
              </p>
            ) : null}
            <div className="bill-payment-options">
              <button
                type="button"
                className={selectedPayment === 'pos' ? 'selected' : undefined}
                aria-pressed={selectedPayment === 'pos'}
                disabled={requestingBill}
                onClick={() => setSelectedPayment('pos')}
              >
                <CreditCard size={24} />
                <strong>{t('order.cardPayment')}</strong>
              </button>
              <button
                type="button"
                className={selectedPayment === 'cash' ? 'selected' : undefined}
                aria-pressed={selectedPayment === 'cash'}
                disabled={requestingBill}
                onClick={() => setSelectedPayment('cash')}
              >
                <Banknote size={24} />
                <strong>{t('order.cashPayment')}</strong>
              </button>
            </div>
            <div className="bill-dialog-actions">
              <button type="button" className="secondary-button" disabled={requestingBill} onClick={() => { setBillOpen(false); setSelectedPayment(null); }}>
                {t('order.cancel')}
              </button>
              <button type="button" className="primary-button" disabled={!hasOrders || !selectedPayment || requestingBill} onClick={() => selectedPayment && sendBillRequest(selectedPayment)}>
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
          total: formatCartPrice(cartSummary.totalPrice),
        })}
        onClick={() => setCartOpen(true)}
      >
        <span className="mobile-cart-summary">
          <ShoppingBag size={18} />
          {t('order.cartBarSummary', {
            count: cartSummary.totalQuantity,
            total: formatCartPrice(cartSummary.totalPrice),
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

function formatCartPrice(price: number) {
  return `€${price.toFixed(2)}`;
}

function DishQuantityControl({
  item,
  line,
  disabled,
  onAdd,
  onChange,
  addLabel,
}: {
  item: MenuItem;
  line?: CartItem;
  disabled: boolean;
  onAdd: () => void;
  onChange: (line: CartItem, nextQuantity: number) => void;
  addLabel: string;
}) {
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
      <button type="button" onClick={() => onChange(line, line.quantity - 1)}>
        <Minus size={15} />
      </button>
      <strong>{line.quantity}</strong>
      <button type="button" onClick={() => onChange(line, line.quantity + 1)}>
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
  return `wok-dragon:table-session:${qrToken}`;
}

function readSavedTableSession(qrToken: string): SavedTableSession | null {
  try {
    const raw = window.localStorage.getItem(tableSessionStorageKey(qrToken));
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<SavedTableSession>;
    if (typeof value.session_id !== 'string' || typeof value.table_id !== 'string' || typeof value.table_number !== 'number') {
      window.localStorage.removeItem(tableSessionStorageKey(qrToken));
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
