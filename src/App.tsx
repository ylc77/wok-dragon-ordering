import { useEffect, useState } from 'react';
import { Link, Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { Menu, Settings, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { HomePage } from './pages/HomePage';
import { MenuPage } from './pages/MenuPage';
import { TableOrderPage } from './pages/TableOrderPage';
import { AdminPage } from './pages/AdminPage';
import { LanguageSwitch } from './components/LanguageSwitch';
import { getRestaurantSettings, subscribeToRestaurantSettings } from './lib/menuApi';
import { getLocalizedField } from './lib/localized';
import type { Language, RestaurantSettings } from './lib/types';

function PublicShell() {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const isAdmin = location.pathname.startsWith('/admin');
  const isTableOrder = location.pathname.startsWith('/table/');
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
    void getRestaurantSettings().then(setSettings).catch(() => setSettings(null));
    return subscribeToRestaurantSettings(setSettings);
  }, []);

  useEffect(() => {
    document.title = restaurantName;
    document.querySelector('meta[name="description"]')?.setAttribute('content', `${restaurantName} restaurant website and QR table ordering.`);
  }, [restaurantName]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname, location.hash]);

  if (isAdmin) {
    return <AdminPage />;
  }

  if (isTableOrder) {
    return (
      <Routes>
        <Route path="/table/:qrToken" element={<TableOrderPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  return (
    <>
      <header className="site-header">
        <div className="site-header-inner">
          <Link className="brand" to="/">
            {settings?.logo_url ? <img className="brand-logo" src={settings.logo_url} alt="" /> : <span className="brand-mark">餐</span>}
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
            <a href="/#contact">{t('nav.contact')}</a>
          </nav>
          <div className="site-header-actions">
          <LanguageSwitch />
          <Link className="icon-button" to="/admin" title="Admin">
            <Settings size={18} />
          </Link>
          </div>
        </div>
      </header>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/menu" element={<MenuPage />} />
        <Route path="/table/:qrToken" element={<TableOrderPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

export function App() {
  return <PublicShell />;
}
