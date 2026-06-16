import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Globe2, Settings } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { HomePage } from './pages/HomePage';
import { MenuPage } from './pages/MenuPage';
import { TableOrderPage } from './pages/TableOrderPage';
import { AdminPage } from './pages/AdminPage';

function PublicShell() {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const isAdmin = location.pathname.startsWith('/admin');

  if (isAdmin) {
    return <AdminPage />;
  }

  const nextLang = i18n.language === 'el' ? 'en' : 'el';

  return (
    <>
      <header className="site-header">
        <Link className="brand" to="/">
          <span className="brand-mark">龙</span>
          <span>
            <strong>Wok Dragon Express</strong>
            <small>Monastiraki Athens</small>
          </span>
        </Link>
        <nav className="nav-links" aria-label={t('nav.primary')}>
          <Link to="/">{t('nav.home')}</Link>
          <Link to="/menu">{t('nav.menu')}</Link>
          <a href="#contact">{t('nav.contact')}</a>
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
        </nav>
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
