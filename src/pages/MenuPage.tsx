import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { Search, ChevronUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getPublicMenu, getRestaurantSettings } from '../lib/menuApi';
import { formatPrice, getLocalizedField } from '../lib/localized';
import type { Language, MenuGroup, MenuItem, RestaurantSettings } from '../lib/types';

/* ── 共享逻辑 ── */

function useMenuData() {
  const [groups, setGroups] = useState<MenuGroup[]>([]);
  const [settings, setSettings] = useState<RestaurantSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'Menu';
    getRestaurantSettings().then(setSettings).catch(() => {});
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
  const { t } = useTranslation();
  return (
    <section className="page-heading">
      <div>
        {settings?.logo_url ? <img className="brand-logo" src={settings.logo_url} alt="" /> : <span className="page-brand-mark">{tag}</span>}
        <div>
          <h1>{t('nav.menu')}</h1>
          <p>{t('common.priceNote')}</p>
        </div>
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

export function MenuCard({ item, lang, action }: { item: MenuItem; lang: Language; action?: ReactNode }) {
  const { t } = useTranslation();
  const name = getLocalizedField(lang, { zh: item.name_zh, en: item.name_en, el: item.name_el });
  const desc = getLocalizedField(lang, { zh: item.description_zh, en: item.description_en, el: item.description_el });
  return (
    <article className={`menu-card${item.is_sold_out ? ' sold-out' : ''}`}>
      <DishImage item={item} alt={name} />
      {item.is_sold_out ? <span className="sold-out-badge">{t('common.soldOut')}</span> : null}
      <div>
        <div className="menu-card-title"><h3>{name}</h3><strong>{formatPrice(Number(item.price), lang)}</strong></div>
        {desc ? <p>{desc}</p> : null}
        {action}
      </div>
    </article>
  );
}

function DishImage({ item, alt }: { item: MenuItem; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (!item.image_url || failed) return <div className="menu-card-fallback" aria-hidden="true"><span className="mcf-icon" /></div>;
  return <img src={item.image_url} alt={alt} width="118" height="118" loading="lazy" onError={() => setFailed(true)} />;
}

/* ── 移动端菜单 ── */

function MobileMenu({ visibleGroups, lang, search, setSearch, settings }: { visibleGroups: MenuGroup[]; lang: Language; search: string; setSearch: (v: string) => void; settings: RestaurantSettings | null; }) {
  const [activeCat, setActiveCat] = useState('');
  const mainRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLElement>(null);
  const manualRef = useRef(false);

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
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => { manualRef.current = false; }, 800);
  }, []);

  return (
    <div className="menu-mobile-root">
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
          {settings?.logo_url ? <img className="mobile-head-logo" src={settings.logo_url} alt="" /> : null}
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

function DesktopMenu({ visibleGroups, lang, search, setSearch }: { visibleGroups: MenuGroup[]; lang: Language; search: string; setSearch: (v: string) => void }) {
  const [activeCat, setActiveCat] = useState('');
  const manualRef = useRef(false);

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

  const filteredGroups = useFilteredGroups(groups, search, lang);
  const visibleGroups = filteredGroups.filter((g) => g.items.length > 0);

  // 移动端锁定 body 滚动
  useEffect(() => {
    const lock = () => { if (window.innerWidth < 768) document.body.style.overflow = 'hidden'; };
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
      <div className="menu-desktop-only"><MenuIntro settings={settings} /></div>

      {loading ? <p className="muted" style={{ textAlign: 'center', padding: '20px' }}>{t('common.loading')}</p> : null}
      {error ? <p className="error-text">{error}</p> : null}
      {!loading && visibleGroups.length === 0 ? <p className="muted" style={{ textAlign: 'center', padding: '20px' }}>{search ? (lang === 'el' ? 'Δεν βρέθηκαν πιάτα' : 'No dishes found') : t('common.empty')}</p> : null}

      {/* 移动端 */}
      <MobileMenu visibleGroups={visibleGroups} lang={lang} search={search} setSearch={setSearch} settings={settings} />

      {/* 桌面端 */}
      <DesktopMenu visibleGroups={visibleGroups} lang={lang} search={search} setSearch={setSearch} />

      {showBackTop ? (
        <button className="menu-back-top" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} title={lang === 'el' ? 'Πίσω στην κορυφή' : 'Back to top'}>
          <ChevronUp size={20} />
        </button>
      ) : null}
    </main>
  );
}
