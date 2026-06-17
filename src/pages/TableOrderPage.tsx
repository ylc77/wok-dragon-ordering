import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react';
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
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

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

  async function addItem(item: MenuItem) {
    if (!sessionInfo) return;
    try {
      await addCartItem(sessionInfo.session_id, item.id, 1, notes[item.id] ?? '');
      setNotes((current) => ({ ...current, [item.id]: '' }));
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

  async function submitCurrentOrder() {
    if (!sessionInfo || !cart.length) return;
    try {
      setSubmitting(true);
      const result = await submitOrder(sessionInfo.session_id, crypto.randomUUID());
      setMessage(`${t('order.submitSuccess')} ${t('order.orderNumber')}: ${result.order_number}`);
      setCart(await fetchCart(sessionInfo.session_id));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="order-shell">
      <section className="order-menu">
        <div className="order-table-banner">
          <div>
            <span>{loading ? t('order.joining') : t('order.table')}</span>
            <strong>{sessionInfo?.table_number ?? qrToken}</strong>
          </div>
          <p>{t('order.liveCart')}</p>
        </div>
        {message ? <p className="admin-message">{message}</p> : null}
        <nav className="order-category-tabs" aria-label={t('nav.menu')}>
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
                        <div className="item-action">
                          <input
                            aria-label={t('order.note')}
                            placeholder={t('order.note')}
                            value={notes[item.id] ?? ''}
                            onChange={(event) =>
                              setNotes((current) => ({ ...current, [item.id]: event.target.value }))
                            }
                          />
                          <button
                            className="small-primary"
                            type="button"
                            onClick={() => addItem(item)}
                            disabled={!sessionInfo}
                          >
                            <Plus size={16} />
                            {t('order.add')}
                          </button>
                        </div>
                      }
                    />
                  ))}
                </div>
              </section>
            ) : null,
          )}
        </div>
      </section>

      <aside className="cart-panel" id="shared-cart">
        <div className="cart-panel-head">
          <h2>{t('order.sharedCart')}</h2>
          <a href="#" aria-label="Close cart">×</a>
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
              {line.note ? <small>{line.note}</small> : null}
              <span>{formatPrice(Number(line.unit_price) * line.quantity)}</span>
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
            </div>
          );
        })}
        <div className="cart-total">
          <span>{t('common.total')}</span>
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

      <a className="mobile-cart-bar" href="#shared-cart">
        <span>
          <ShoppingBag size={18} />
          {t('order.sharedCart')}
        </span>
        <strong>
          {totalQuantity} · {formatPrice(total)}
        </strong>
      </a>
    </main>
  );
}
