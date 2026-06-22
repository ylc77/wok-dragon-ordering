import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { Search, ChevronUp } from 'lucide-react';
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
  const [search, setSearch] = useState('');
  const [showBackTop, setShowBackTop] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.title = 'Menu';
    getPublicMenu()
      .then(setGroups)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!location.hash || groups.length === 0) return;
    const target = document.getElementById(location.hash.slice(1));
    target?.scrollIntoView({ block: 'start' });
  }, [location.hash, groups.length]);

  // 搜索过滤
  const filteredGroups = useMemo(() => {
    const kw = search.toLowerCase().trim();
    if (!kw) return groups;
    return groups.map((g) => ({
      ...g,
      items: g.items.filter((item) => {
        const name = getLocalizedField(lang, { zh: item.name_zh, en: item.name_en, el: item.name_el }).toLowerCase();
        const desc = getLocalizedField(lang, { zh: item.description_zh, en: item.description_en, el: item.description_el }).toLowerCase();
        return name.includes(kw) || desc.includes(kw);
      }),
    })).filter((g) => g.items.length > 0);
  }, [groups, search, lang]);

  const visibleGroups = filteredGroups.filter((group) => group.items.length > 0);

  const manualRef = useRef(false);

  // 滚动联动 highlight（仅自动滚动时生效）
  useEffect(() => {
    if (visibleGroups.length === 0 || search) return;
    const container = listRef.current;
    if (!container) return;
    const headers = visibleGroups.map((g) => document.getElementById(`cat-${g.id}`)).filter(Boolean) as HTMLElement[];
    if (headers.length === 0) return;

    const onIntersect = () => {
      if (manualRef.current) return; // 手动点击分类时跳过
      // 找离顶部最近的可见 section
      let closest: string | null = null;
      let minDist = Infinity;
      for (const h of headers) {
        const rect = h.getBoundingClientRect();
        if (rect.bottom > 0 && rect.top < window.innerHeight) {
          const dist = Math.abs(rect.top - 120); // 120px = 顶部导航高度
          if (dist < minDist) { minDist = dist; closest = h.id; }
        }
      }
      if (closest) setActiveCat(closest);
    };

    // 用滚动事件代替 IntersectionObserver，更精确
    container.addEventListener('scroll', onIntersect, { passive: true });
    onIntersect(); // 初始触发
    return () => container.removeEventListener('scroll', onIntersect);
  }, [visibleGroups, search]);

  // 返回顶部
  useEffect(() => {
    const onScroll = () => setShowBackTop(window.scrollY > 600);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const scrollToCat = (id: string) => {
    setActiveCat(id); // 立即更新高亮
    manualRef.current = true;
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => { manualRef.current = false; }, 800); // 滚动结束后恢复 observer
  };

  const hasResults = visibleGroups.length > 0;

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

      <div className="menu-search-bar">
        <span className="search-input-wrap menu-search-wrap"><Search size={16} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={lang === 'el' ? 'Αναζήτηση...' : 'Search dishes...'} /></span>
        {search ? <span className="menu-search-count">{visibleGroups.reduce((sum, g) => sum + g.items.length, 0)} {lang === 'el' ? 'αποτελέσματα' : 'results'}</span> : null}
      </div>

      {loading ? <p className="muted" style={{ textAlign: 'center', padding: '20px' }}>{t('common.loading')}</p> : null}
      {error ? <p className="error-text">{error}</p> : null}
      {!loading && !hasResults ? <p className="muted" style={{ textAlign: 'center', padding: '20px' }}>{search ? (lang === 'el' ? 'Δεν βρέθηκαν πιάτα' : 'No dishes found') : t('common.empty')}</p> : null}

      <div className="menu-layout">
        {visibleGroups.length > 1 ? (
        <aside className="menu-category-rail">
          {visibleGroups.map((group) => (
            <button key={group.id} className={activeCat === `cat-${group.id}` ? 'active' : ''} onClick={() => { scrollToCat(`cat-${group.id}`); setActiveCat(`cat-${group.id}`); }}>
              {getLocalizedField(lang, { zh: group.name_zh, en: group.name_en, el: group.name_el })}
            </button>
          ))}
        </aside>
        ) : null}
        <div className="menu-list-column" ref={listRef}>
          {visibleGroups.map((group) => (
            <section className="menu-group" id={`cat-${group.id}`} key={group.id}>
              <h2>{getLocalizedField(lang, { zh: group.name_zh, en: group.name_en, el: group.name_el })}</h2>
              <div className="menu-list">
                {group.items.map((item) => <MenuCard item={item} lang={lang} key={item.id} />)}
              </div>
            </section>
          ))}
        </div>
      </div>

      {showBackTop ? (
        <button className="menu-back-top" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} title={lang === 'el' ? 'Πίσω στην κορυφή' : 'Back to top'}>
          <ChevronUp size={20} />
        </button>
      ) : null}
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
