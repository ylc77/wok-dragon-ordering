import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getPublicMenu } from '../lib/menuApi';
import { formatPrice, getLocalizedField } from '../lib/localized';
import type { Language, MenuGroup, MenuItem } from '../lib/types';

export function MenuPage() {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const lang: Language = i18n.language?.startsWith('zh') ? 'zh' : i18n.language?.startsWith('en') ? 'en' : 'el';
  const [groups, setGroups] = useState<MenuGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCat, setActiveCat] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.title = 'Menu';
    getPublicMenu()
      .then(setGroups)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const visibleGroups = groups.filter((group) => group.items.length > 0);

  useEffect(() => {
    if (!location.hash || visibleGroups.length === 0) return;
    const target = document.getElementById(location.hash.slice(1));
    target?.scrollIntoView({ block: 'start' });
  }, [location.hash, visibleGroups.length]);

  // 滚动联动：监听右侧菜品列表滚动，更新左侧分类高亮
  useEffect(() => {
    if (visibleGroups.length === 0) return;
    const container = listRef.current;
    if (!container) return;
    const headers = visibleGroups.map((g) => document.getElementById(`category-${g.id}`)).filter(Boolean) as HTMLElement[];
    if (headers.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length > 0) {
          setActiveCat(visible[0].target.id);
        }
      },
      { root: container, threshold: 0.3, rootMargin: '-20% 0px -70% 0px' },
    );
    headers.forEach((h) => observer.observe(h));
    return () => observer.disconnect();
  }, [visibleGroups]);

  const scrollToCategory = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <main className="page-shell">
      <section className="page-heading">
        <div>
          <span className="page-brand-mark">菜</span>
          <div>
            <h1>{t('nav.menu')}</h1>
            <p>{t('common.priceNote')}</p>
          </div>
        </div>
      </section>

      {loading ? <p className="muted">{t('common.loading')}</p> : null}
      {error ? <p className="error-text">{error}</p> : null}
      {!loading && groups.length === 0 ? <p className="muted">{t('common.empty')}</p> : null}

      <div className="menu-layout">
        {visibleGroups.length > 1 ? (
        <aside className="menu-category-rail">
          {visibleGroups.map((group) => (
            <button
              key={group.id}
              className={activeCat === `category-${group.id}` ? 'active' : ''}
              onClick={() => scrollToCategory(`category-${group.id}`)}
            >
              {getLocalizedField(lang, { zh: group.name_zh, en: group.name_en, el: group.name_el })}
            </button>
          ))}
        </aside>
        ) : null}
        <div className="menu-list-column" ref={listRef}>
          {visibleGroups.map((group) =>
            group.items.length ? (
              <section className="menu-group" id={`category-${group.id}`} key={group.id}>
                <h2>{getLocalizedField(lang, { zh: group.name_zh, en: group.name_en, el: group.name_el })}</h2>
                <div className="menu-list">
                  {group.items.map((item) => (
                    <MenuCard item={item} lang={lang} key={item.id} />
                  ))}
                </div>
              </section>
            ) : null,
          )}
        </div>
      </div>
    </main>
  );
}

export function MenuCard({
  item,
  lang,
  action,
}: {
  item: MenuItem;
  lang: Language;
  action?: ReactNode;
}) {
  const { t } = useTranslation();
  const name = getLocalizedField(lang, {
    zh: item.name_zh,
    en: item.name_en,
    el: item.name_el,
  });
  const description = getLocalizedField(lang, {
    zh: item.description_zh,
    en: item.description_en,
    el: item.description_el,
  });

  return (
    <article className={`menu-card${item.is_sold_out ? ' sold-out' : ''}`}>
      <DishImage item={item} alt={name} />
      {item.is_sold_out ? <span className="sold-out-badge">{t('common.soldOut')}</span> : null}
      <div>
        <div className="menu-card-title">
          <h3>{name}</h3>
          <strong>{formatPrice(Number(item.price), lang)}</strong>
        </div>
        {description ? <p>{description}</p> : null}
        {action}
      </div>
    </article>
  );
}

function DishImage({ item, alt }: { item: MenuItem; alt: string }) {
  const [failed, setFailed] = useState(false);

  if (!item.image_url || failed) {
    return <div className="menu-card-fallback" aria-hidden="true"><span className="mcf-icon" /></div>;
  }

  return <img src={item.image_url} alt={alt} width="118" height="118" loading="lazy" onError={() => setFailed(true)} />;
}
