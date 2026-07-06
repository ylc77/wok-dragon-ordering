import { lazy, Suspense, useEffect, useState } from 'react';
import { Link, Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LanguageSwitch } from './components/LanguageSwitch';
import { SafeImage } from './components/SafeImage';
import { CookieBanner } from './components/CookieBanner';
import { SiteFooter } from './components/SiteFooter';
import { getPublicRestaurantSettings } from './lib/publicRestaurantApi';
import { getOptimizedImageUrl } from './lib/imageUrl';
import { getLocalizedField } from './lib/localized';
import type { Language, RestaurantSettings } from './lib/types';

const HomePage = lazy(() => import('./pages/HomePage').then((module) => ({ default: module.HomePage })));
const MenuPage = lazy(() => import('./pages/MenuPage').then((module) => ({ default: module.MenuPage })));
const TableOrderPage = lazy(() => import('./pages/TableOrderPage').then((module) => ({ default: module.TableOrderPage })));
const AdminPage = lazy(() => import('./pages/AdminPage').then((module) => ({ default: module.AdminPage })));
const LegalPage = lazy(() => import('./pages/LegalPage').then((module) => ({ default: module.LegalPage })));
const VendorSettingsPage = lazy(() => import('./pages/VendorSettingsPage').then((module) => ({ default: module.VendorSettingsPage })));

function PublicShell() {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const isAdmin = location.pathname.startsWith('/admin');
  const isTableOrder = location.pathname.startsWith('/table/');
  const isVendorSettings = location.pathname === '/_vendor-settings';
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [settings, setSettings] = useState<RestaurantSettings | null>(null);
  const lang: Language = i18n.language?.startsWith('zh') ? 'zh' : i18n.language?.startsWith('en') ? 'en' : 'el';
  const restaurantName = settings
    ? getLocalizedField(lang, { zh: settings.name_zh, en: settings.name_en, el: settings.name_el })
    : t('home.title');
  const restaurantAddress = settings
    ? getLocalizedField(lang, { zh: settings.address_zh, en: settings.address_en, el: settings.address_el })
    : '';

  useEffect(() => {
    let cancelled = false;
    void getPublicRestaurantSettings()
      .then((next) => {
        if (!cancelled) setSettings(next);
      })
      .catch(() => {
        if (!cancelled) setSettings(null);
      });
    return () => { cancelled = true; };
  }, []);

  // 品牌色 + 标题 + favicon
  useEffect(() => {
    if (settings?.brand_color) {
      document.documentElement.style.setProperty('--accent', settings.brand_color);
    } else {
      document.documentElement.style.removeProperty('--accent');
    }
    document.title = settings?.meta_title || restaurantName;
    if (settings?.favicon_url) {
      const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]') || document.createElement('link');
      link.rel = 'icon'; link.href = settings.favicon_url;
      if (!document.querySelector('link[rel="icon"]')) document.head.appendChild(link);
    }
  }, [settings, restaurantName]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname, location.hash]);

  if (isAdmin) {
    return <Suspense fallback={null}><AdminPage /></Suspense>;
  }

  if (isVendorSettings) {
    return <Suspense fallback={null}><VendorSettingsPage /></Suspense>;
  }

  if (isTableOrder) {
    return (
      <Suspense fallback={null}>
        <Routes>
          <Route path="/table/:qrToken" element={<TableOrderPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    );
  }

  return (
    <>
      <header className="site-header">
        <div className="site-header-inner">
          <Link className="brand" to="/">
            <SafeImage src={settings?.logo_url} optimizedSrc={getOptimizedImageUrl(settings?.logo_url, 'logo')} className="brand-logo" alt="" fallback={<span className="brand-mark">餐</span>} />
            <span>
              <strong>{restaurantName}</strong>
              {restaurantAddress ? <small>{restaurantAddress}</small> : null}
            </span>
          </Link>
          <button
            className="mobile-nav-toggle"
            type="button"
            aria-label={mobileNavOpen ? t('nav.close') : t('nav.open')}
            aria-expanded={mobileNavOpen}
            onClick={() => setMobileNavOpen((open) => !open)}
          >
            {mobileNavOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <nav className={`nav-links ${mobileNavOpen ? 'is-open' : ''}`} aria-label={t('nav.primary')}>
            <NavLink to="/" end>{t('nav.home')}</NavLink>
            <NavLink to="/menu">{t('nav.menu')}</NavLink>
            <NavLink to="/contact">{t('nav.contact')}</NavLink>
          </nav>
          <div className="site-header-actions">
          <LanguageSwitch />
          </div>
        </div>
      </header>
      <Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/menu" element={<MenuPage />} />
          <Route path="/privacy-policy" element={<LegalPage />} />
          <Route path="/terms-of-service" element={<LegalPage />} />
          <Route path="/cookie-policy" element={<LegalPage />} />
          <Route path="/contact" element={<LegalPage />} />
          <Route path="/cancellation-policy" element={<LegalPage />} />
          <Route path="/refund-policy" element={<LegalPage />} />
          <Route path="/shipping-policy" element={<LegalPage />} />
          <Route path="/return-policy" element={<LegalPage />} />
          <Route path="/table/:qrToken" element={<TableOrderPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      <SiteFooter name={restaurantName} address={restaurantAddress} settings={settings} />
      <CookieBanner />
    </>
  );
}

export function App() {
  return <PublicShell />;
}
