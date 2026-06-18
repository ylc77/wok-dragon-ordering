import { useEffect, useState } from 'react';
import { Link, Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { Globe2, Menu, Settings, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { HomePage } from './pages/HomePage';
import { MenuPage } from './pages/MenuPage';
import { TableOrderPage } from './pages/TableOrderPage';
import { AdminPage } from './pages/AdminPage';

function PublicShell() {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const isAdmin = location.pathname.startsWith('/admin');
  const isTableOrder = location.pathname.startsWith('/table/');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

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

  const nextLang = i18n.language === 'el' ? 'en' : 'el';

  return (
    <>
      <header className="site-header">
        <div className="site-header-inner">
          <Link className="brand" to="/">
            <span className="brand-mark">龙</span>
            <span>
              <strong>Wok Dragon Express</strong>
              <small>Monastiraki · Athens</small>
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
            <Link to="/#contact">{t('nav.contact')}</Link>
          </nav>
          <div className="site-header-actions">
          <button
            className="icon-text-button"
            type="button"
            onClick={() => i18n.changeLanguage(nextLang)}
          >
            <Globe2 size={18} />
            {nextLang.toUpperCase()}
          </button>
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
