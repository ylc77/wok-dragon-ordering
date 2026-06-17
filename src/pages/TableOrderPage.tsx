import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Globe2, Menu, Minus, Plus, ShoppingBag, Trash2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { MenuCard } from './MenuPage';
import { getPublicMenu, requireAnonymousSession } from '../lib/menuApi';
import { hasSupabaseConfig } from '../lib/supabase';
import { formatPrice, getLocalizedField } from '../lib/localized';
import {
  addCartItem,
  fetchCart,
  joinTableSession,
  removeCartItem,
  submitOrder,
  subscribeToTableCart,
  updateCartItemNote,
  updateCartItemQuantity,
} from '../lib/orderApi';
import type { CartItem, Language, MenuGroup, MenuItem, TableJoinResult } from '../lib/types';

export function TableOrderPage() {
  const { qrToken = '' } = useParams();
  const { t, i18n } = useTranslation();
  const lang = (i18n.language === 'en' ? 'en' : 'el') as Language;
  const [groups, setGroups] = useState<MenuGroup[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [sessionInfo, setSessionInfo] = useState<TableJoinResult | null>(null);
  const [draftNotes, setDraftNotes] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);

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
        const joined = await joinTableSession(qrToken);
        if (cancelled) return;
        setSessionInfo(joined);
        const [menuGroups, cartRows] = await Promise.all([menuPromise, fetchCart(joined.session_id)]);
        if (cancelled) return;
        setGroups(menuGroups);
        setCart(cartRows);
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
  }, [qrToken]);

  useEffect(() => {
    if (!sessionInfo) return;
    return subscribeToTableCart(sessionInfo.session_id, () => {
      fetchCart(sessionInfo.session_id)
        .then(setCart)
        .catch((err) => setMessage(err.message));
    });
  }, [sessionInfo]);

  const total = useMemo(
    () => cart.reduce((sum, line) => sum + Number(line.unit_price) * line.quantity, 0),
    [cart],
  );
  const totalQuantity = useMemo(
    () => cart.reduce((sum, line) => sum + line.quantity, 0),
    [cart],
  );
  const cartByMenuItemId = useMemo(() => {
    const rows = new Map<string, CartItem>();
    cart.forEach((line) => {
      rows.set(line.menu_item_id, line);
    });
    return rows;
  }, [cart]);
  const nextLang = lang === 'el' ? 'en' : 'el';

  async function addItem(item: MenuItem) {
    if (!sessionInfo) return;
    try {
      await addCartItem(sessionInfo.session_id, item.id, 1, '');
      setCart(await fetchCart(sessionInfo.session_id));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    }
  }

  async function updateQuantity(line: CartItem, nextQuantity: number) {
    if (!sessionInfo) return;
    try {
      if (nextQuantity <= 0) {
        await removeCartItem(line.id);
      } else {
        await updateCartItemQuantity(line.id, nextQuantity);
      }
      setCart(await fetchCart(sessionInfo.session_id));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    }
  }

  async function saveNote(line: CartItem, note: string) {
    if (!sessionInfo) return;
    try {
      await updateCartItemNote(line.id, note);
      setCart(await fetchCart(sessionInfo.session_id));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    }
  }

  async function submitCurrentOrder() {
    if (!sessionInfo || !cart.length) return;
    try {
      setSubmitting(true);
      const result = await submitOrder(sessionInfo.session_id, crypto.randomUUID());
      setMessage(`${t('order.submitSuccess')} ${t('order.orderNumber')}: ${result.order_number}`);
      setCart(await fetchCart(sessionInfo.session_id));
      setCartOpen(false);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

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
        <nav className="order-category-tabs" id="order-categories" aria-label={t('nav.menu')}>
          {groups
            .filter((group) => group.items.length)
            .map((group) => (
              <a href={`#order-category-${group.id}`} key={group.id}>
                {getLocalizedField(lang, {
                  zh: group.name_zh,
                  en: group.name_en,
                  el: group.name_el,
                })}
              </a>
            ))}
        </nav>
        <div className="order-menu-groups">
          {groups.map((group) =>
            group.items.length ? (
              <section className="menu-group" id={`order-category-${group.id}`} key={group.id}>
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
                          disabled={!sessionInfo}
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

      {cartOpen ? <button className="cart-backdrop" type="button" aria-label="Close cart" onClick={() => setCartOpen(false)} /> : null}

      <aside className={`cart-panel ${cartOpen ? 'open' : ''}`} id="shared-cart" aria-hidden={!cartOpen}>
        <div className="cart-panel-head">
          <h2>{t('order.sharedCart')}</h2>
          <button type="button" aria-label="Close cart" onClick={() => setCartOpen(false)}>
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
              <span>{formatPrice(Number(line.unit_price))}</span>
              <strong className="cart-line-subtotal">{formatPrice(Number(line.unit_price) * line.quantity)}</strong>
              <div className="cart-controls">
                <button type="button" onClick={() => updateQuantity(line, line.quantity - 1)}>
                  <Minus size={15} />
                </button>
                <span>{line.quantity}</span>
                <button type="button" onClick={() => updateQuantity(line, line.quantity + 1)}>
                  <Plus size={15} />
                </button>
                <button type="button" onClick={() => updateQuantity(line, 0)}>
                  <Trash2 size={15} />
                </button>
              </div>
              <label className="cart-note-field">
                {t('order.note')}
                <input
                  value={draftNotes[line.id] ?? line.note ?? ''}
                  placeholder={t('order.note')}
                  onChange={(event) => setDraftNotes((current) => ({ ...current, [line.id]: event.target.value }))}
                  onBlur={(event) => saveNote(line, event.target.value)}
                />
              </label>
            </div>
          );
        })}
        <div className="cart-total">
          <span>{t('order.selectedCount', { count: totalQuantity })}</span>
          <strong>{formatPrice(total)}</strong>
        </div>
        <button
          className="primary-button stretch"
          type="button"
          disabled={!cart.length || submitting}
          onClick={submitCurrentOrder}
        >
          {t('order.submit')}
        </button>
      </aside>

      <button className={`mobile-cart-bar ${cart.length ? '' : 'is-empty'}`} type="button" onClick={() => setCartOpen(true)}>
        <span>
          <ShoppingBag size={18} />
          {t('order.viewCart')}
        </span>
        <strong>
          {t('order.selectedCount', { count: totalQuantity })} · {formatPrice(total)}
        </strong>
        <em>{t('order.checkout')}</em>
      </button>
    </main>
  );
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
