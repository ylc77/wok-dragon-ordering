import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Search, ChevronUp, CalendarDays } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SafeImage } from '../components/SafeImage';
import { MenuCard } from '../components/MenuCard';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { getPublicMenu } from '../lib/publicMenuApi';
import { getPublicRestaurantSettings } from '../lib/publicRestaurantApi';
import { getOptimizedImageUrl } from '../lib/imageUrl';
import { getLocalizedField } from '../lib/localized';
import { getFeatureFlags } from '../lib/featureFlags';
import type { Language, MenuGroup, RestaurantSettings } from '../lib/types';

/* ── 共享逻辑 ── */

function useMenuData() {
  const [groups, setGroups] = useState<MenuGroup[]>([]);
  const [settings, setSettings] = useState<RestaurantSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'Menu';
    getPublicRestaurantSettings().then(setSettings).catch(() => {});
    getPublicMenu().then(setGroups).catch((err) => setError(err.message)).finally(() => setLoading(false));
  }, []);

  return { groups, settings, loading, error };
}

function useFilteredGroups(groups: MenuGroup[], search: string, lang: Language) {
  return useMemo(() => {
    const kw = search.toLowerCase().trim();
    if (!kw) return groups;
    return groups.map((g) => ({
      ...g, items: g.items.filter((item) => {
        const name = getLocalizedField(lang, { zh: item.name_zh, en: item.name_en, el: item.name_el }).toLowerCase();
        const desc = getLocalizedField(lang, { zh: item.description_zh, en: item.description_en, el: item.description_el }).toLowerCase();
        return name.includes(kw) || desc.includes(kw);
      }),
    })).filter((g) => g.items.length > 0);
  }, [groups, search, lang]);
}

/* ── 共享组件 ── */

function MenuIntro({ settings, tag = '菜' }: { settings: RestaurantSettings | null; tag?: string }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language?.startsWith('zh') ? 'zh' : i18n.language?.startsWith('en') ? 'en' : 'el';
  const reservationLabel = lang === 'zh' ? '预订餐桌' : lang === 'en' ? 'Reserve a table' : 'Κράτηση τραπεζιού';
  const reservationsEnabled = settings ? getFeatureFlags(settings).reservations : false;
  return (
    <section className="page-heading">
      <div>
        <SafeImage src={settings?.logo_url} optimizedSrc={getOptimizedImageUrl(settings?.logo_url, 'logo')} className="brand-logo" alt="" fallback={<span className="page-brand-mark">{tag}</span>} />
        <div>
          <h1>{t('nav.menu')}</h1>
          <p>{t('common.priceNote')}</p>
        </div>
        {reservationsEnabled ? <Link className="menu-reservation-link" to="/reservations"><CalendarDays size={16} />{reservationLabel}</Link> : null}
      </div>
    </section>
  );
}

function SearchBar({ search, setSearch, count, lang }: { search: string; setSearch: (v: string) => void; count: number; lang: Language }) {
  return (
    <div className="menu-search-bar">
      <span className="search-input-wrap menu-search-wrap"><Search size={16} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={lang === 'el' ? 'Αναζήτηση...' : 'Search dishes...'} /></span>
      {search ? <span className="menu-search-count">{count} {lang === 'el' ? 'αποτελέσματα' : 'results'}</span> : null}
    </div>
  );
}

function MobileMenu({ visibleGroups, lang, search, setSearch, settings, targetCategoryId }: { visibleGroups: MenuGroup[]; lang: Language; search: string; setSearch: (v: string) => void; settings: RestaurantSettings | null; targetCategoryId: string | null; }) {
  const [activeCat, setActiveCat] = useState('');
  const mainRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLElement>(null);
  const manualRef = useRef(false);
  const handledTargetRef = useRef<string | null>(null);
  const itemCount = visibleGroups.reduce((sum, group) => sum + group.items.length, 0);
  const reservationsEnabled = settings ? getFeatureFlags(settings).reservations : false;
  const menuTitle = lang === 'zh' ? '公开菜单' : lang === 'en' ? 'Menu' : 'Μενού';
  const reservationLabel = lang === 'zh' ? '预订餐桌' : lang === 'en' ? 'Reserve a table' : 'Κράτηση τραπεζιού';

  // 滚动联动：监听右侧 main 容器
  useEffect(() => {
    if (visibleGroups.length === 0 || search) return;
    const main = mainRef.current; if (!main) return;
    const rail = railRef.current;
    const ids = visibleGroups.map((g) => `mcat-${g.id}`);
    const sections = ids.map((id) => document.getElementById(id)).filter(Boolean) as HTMLElement[];
    if (sections.length === 0) return;

    const handler = () => {
      if (manualRef.current) return;
      // 滚回顶部时，左侧分类栏也回顶部
      if (main.scrollTop < 10 && rail && visibleGroups.length > 0) {
        rail.scrollTo({ top: 0, behavior: 'smooth' });
        setActiveCat(`mcat-${visibleGroups[0].id}`);
        return;
      }
      let best: string | null = null; let bestDist = Infinity;
      for (const s of sections) {
        const rect = s.getBoundingClientRect();
        if (rect.bottom > 80 && rect.top < window.innerHeight) {
          const d = Math.abs(rect.top - 100);
          if (d < bestDist) { bestDist = d; best = s.id; }
        }
      }
      if (best) setActiveCat(best);
    };
    main.addEventListener('scroll', handler, { passive: true });
    handler();
    return () => main.removeEventListener('scroll', handler);
  }, [visibleGroups, search]);

  // 当前分类变化时，左侧按钮滚入可见区域
  useEffect(() => {
    if (!activeCat || !railRef.current) return;
    const btn = document.getElementById(activeCat)?.closest('button');
    if (!btn) return;
    const rail = railRef.current;
    const railRect = rail.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();
    if (btnRect.top < railRect.top + 4 || btnRect.bottom > railRect.bottom - 4) {
      btn.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [activeCat]);

  const scrollTo = useCallback((id: string) => {
    setActiveCat(id);
    manualRef.current = true;
    const target = document.getElementById(id);
    const container = mainRef.current;
    if (target && container) {
      const ct = container.getBoundingClientRect().top;
      const tt = target.getBoundingClientRect().top;
      const next = container.scrollTop + (tt - ct);
      const max = container.scrollHeight - container.clientHeight;
      container.scrollTo({ top: Math.min(next, max), behavior: 'smooth' });
    }
    setTimeout(() => { manualRef.current = false; }, 800);
  }, []);

  useEffect(() => {
    if (!targetCategoryId || handledTargetRef.current === targetCategoryId) return;
    if (!visibleGroups.some((group) => group.id === targetCategoryId)) return;
    handledTargetRef.current = targetCategoryId;
    const frame = window.requestAnimationFrame(() => scrollTo(`mcat-${targetCategoryId}`));
    return () => window.cancelAnimationFrame(frame);
  }, [scrollTo, targetCategoryId, visibleGroups]);

  return (
    <div className="menu-mobile-root">
      <div className="mobile-menu-toolbar">
        <div><span>{itemCount} {lang === 'zh' ? '道菜品' : lang === 'en' ? 'dishes' : 'πιάτα'}</span><strong>{menuTitle}</strong></div>
        {reservationsEnabled ? <Link className="mobile-menu-reservation" to="/reservations"><CalendarDays size={16} />{reservationLabel}</Link> : null}
      </div>
      <SearchBar search={search} setSearch={setSearch} count={itemCount} lang={lang} />
      <div className="menu-mobile-body">
        {visibleGroups.length > 1 ? (
          <aside ref={railRef} className="mobile-rail">
            {visibleGroups.map((g) => (
              <button key={g.id} className={activeCat === `mcat-${g.id}` ? 'active' : ''} onClick={() => scrollTo(`mcat-${g.id}`)}>
                {getLocalizedField(lang, { zh: g.name_zh, en: g.name_en, el: g.name_el })}
              </button>
            ))}
          </aside>
        ) : null}
        <main ref={mainRef} className="mobile-main">
          {visibleGroups.map((g) => (
            <section className="menu-group" id={`mcat-${g.id}`} key={g.id}>
              <h2>{getLocalizedField(lang, { zh: g.name_zh, en: g.name_en, el: g.name_el })}</h2>
              <div className="menu-list">{g.items.map((item) => <MenuCard item={item} lang={lang} key={item.id} />)}</div>
            </section>
          ))}
        </main>
      </div>
    </div>
  );
}

/* ── 桌面端菜单 ── */

function DesktopMenu({ visibleGroups, lang, search, setSearch, targetCategoryId }: { visibleGroups: MenuGroup[]; lang: Language; search: string; setSearch: (v: string) => void; targetCategoryId: string | null }) {
  const [activeCat, setActiveCat] = useState('');
  const manualRef = useRef(false);
  const handledTargetRef = useRef<string | null>(null);

  // 滚动联动：桌面端用 window scroll
  useEffect(() => {
    if (visibleGroups.length === 0 || search) return;
    const ids = visibleGroups.map((g) => `dcat-${g.id}`);
    const sections = ids.map((id) => document.getElementById(id)).filter(Boolean) as HTMLElement[];
    if (sections.length === 0) return;

    const handler = () => {
      if (manualRef.current) return;
      let best: string | null = null; let bestDist = Infinity;
      for (const s of sections) {
        const rect = s.getBoundingClientRect();
        if (rect.bottom > 80 && rect.top < window.innerHeight) {
          const d = Math.abs(rect.top - 100);
          if (d < bestDist) { bestDist = d; best = s.id; }
        }
      }
      if (best) setActiveCat(best);
    };
    window.addEventListener('scroll', handler, { passive: true });
    handler();
    return () => window.removeEventListener('scroll', handler);
  }, [visibleGroups, search]);

  const scrollTo = useCallback((id: string) => {
    setActiveCat(id);
    manualRef.current = true;
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => { manualRef.current = false; }, 800);
  }, []);

  useEffect(() => {
    if (!targetCategoryId || handledTargetRef.current === targetCategoryId) return;
    if (!visibleGroups.some((group) => group.id === targetCategoryId)) return;
    handledTargetRef.current = targetCategoryId;
    const frame = window.requestAnimationFrame(() => scrollTo(`dcat-${targetCategoryId}`));
    return () => window.cancelAnimationFrame(frame);
  }, [scrollTo, targetCategoryId, visibleGroups]);

  return (
    <div className="menu-desktop-only">
      <div className="menu-layout">
        {visibleGroups.length > 1 ? (
          <aside className="menu-category-rail">
            {visibleGroups.map((g) => (
              <button key={g.id} className={activeCat === `dcat-${g.id}` ? 'active' : ''} onClick={() => scrollTo(`dcat-${g.id}`)}>
                {getLocalizedField(lang, { zh: g.name_zh, en: g.name_en, el: g.name_el })}
              </button>
            ))}
          </aside>
        ) : null}
        <main className="menu-list-column">
          {visibleGroups.map((g) => (
            <section className="menu-group" id={`dcat-${g.id}`} key={g.id}>
              <h2>{getLocalizedField(lang, { zh: g.name_zh, en: g.name_en, el: g.name_el })}</h2>
              <div className="menu-list">{g.items.map((item) => <MenuCard item={item} lang={lang} key={item.id} />)}</div>
            </section>
          ))}
        </main>
      </div>
    </div>
  );
}

/* ── 主入口 ── */

export function MenuPage() {
  const { t, i18n } = useTranslation();
  const lang: Language = i18n.language?.startsWith('zh') ? 'zh' : i18n.language?.startsWith('en') ? 'en' : 'el';
  const { groups, settings, loading, error } = useMenuData();
  const [search, setSearch] = useState('');
  const [showBackTop, setShowBackTop] = useState(false);
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const location = useLocation();
  const targetCategoryId = location.hash.startsWith('#category-')
    ? decodeURIComponent(location.hash.slice('#category-'.length))
    : null;

  // 过滤掉不适合公开菜单展示的分类（如餐具）
  const publicGroups = useMemo(() => groups.filter((g) => {
    const name = ((g.name_en ?? '') + (g.name_el ?? '') + g.name_zh).toLowerCase();
    return !name.includes('μαχαιροπίρουνα') && !name.includes('utensil') && !name.includes('餐具');
  }), [groups]);

  const filteredGroups = useFilteredGroups(publicGroups, search, lang);
  const visibleGroups = filteredGroups.filter((g) => g.items.length > 0);
  const visibleItemCount = visibleGroups.reduce((sum, group) => sum + group.items.length, 0);

  // 移动端锁定 body 滚动
  useEffect(() => {
    const lock = () => { document.body.style.overflow = window.innerWidth < 768 ? 'hidden' : ''; };
    lock();
    window.addEventListener('resize', lock);
    return () => { document.body.style.overflow = ''; window.removeEventListener('resize', lock); };
  }, []);

  useEffect(() => {
    const onScroll = () => setShowBackTop(window.scrollY > 600);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <main className="page-shell">
      {isDesktop ? (
        <>
          <div className="menu-desktop-only"><MenuIntro settings={settings} /></div>
          <div className="menu-desktop-only">
            <SearchBar search={search} setSearch={setSearch} count={visibleItemCount} lang={lang} />
          </div>
        </>
      ) : null}

      {loading ? <p className="app-state-card menu-state-card"><span className="state-spinner" aria-hidden="true" />{t('common.loading')}</p> : null}
      {error ? <p className="app-state-card menu-state-card error-text">{error}</p> : null}
      {!loading && visibleGroups.length === 0 ? <p className="app-state-card menu-state-card">{search ? (lang === 'el' ? 'Δεν βρέθηκαν πιάτα' : 'No dishes found') : t('common.empty')}</p> : null}

      {/* 移动端 */}
      {!isDesktop && !loading && !error && visibleGroups.length > 0 ? (
        <MobileMenu visibleGroups={visibleGroups} lang={lang} search={search} setSearch={setSearch} settings={settings} targetCategoryId={targetCategoryId} />
      ) : null}

      {/* 桌面端 */}
      {isDesktop && !loading && !error && visibleGroups.length > 0 ? <DesktopMenu visibleGroups={visibleGroups} lang={lang} search={search} setSearch={setSearch} targetCategoryId={targetCategoryId} /> : null}

      {showBackTop ? (
        <button className="menu-back-top" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} title={lang === 'el' ? 'Πίσω στην κορυφή' : 'Back to top'}>
          <ChevronUp size={20} />
        </button>
      ) : null}
    </main>
  );
}
