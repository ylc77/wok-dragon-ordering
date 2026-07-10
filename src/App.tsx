import { lazy, Suspense, useEffect, useState } from 'react';
import { Link, Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { CalendarDays, Menu, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { CookieBanner } from './components/CookieBanner';
import { LanguageSwitch } from './components/LanguageSwitch';
import { SafeImage } from './components/SafeImage';
import { SiteFooter } from './components/SiteFooter';
import { getFeatureFlags } from './lib/featureFlags';
import { getOptimizedImageUrl } from './lib/imageUrl';
import { getLocalizedField } from './lib/localized';
import { getPublicRestaurantSettings } from './lib/publicRestaurantApi';
import type { Language, RestaurantSettings } from './lib/types';

const HomePage = lazy(() => import('./pages/HomePage').then((module) => ({ default: module.HomePage })));
const MenuPage = lazy(() => import('./pages/MenuPage').then((module) => ({ default: module.MenuPage })));
const TableOrderPage = lazy(() => import('./pages/TableOrderPage').then((module) => ({ default: module.TableOrderPage })));
const AdminPage = lazy(() => import('./pages/AdminPage').then((module) => ({ default: module.AdminPage })));
const LegalPage = lazy(() => import('./pages/LegalPage').then((module) => ({ default: module.LegalPage })));
const VendorSettingsPage = lazy(() => import('./pages/VendorSettingsPage').then((module) => ({ default: module.VendorSettingsPage })));
const VendorLegalSettingsPage = lazy(() => import('./pages/VendorLegalSettingsPage').then((module) => ({ default: module.VendorLegalSettingsPage })));
const ReservationPage = lazy(() => import('./pages/ReservationPage').then((module) => ({ default: module.ReservationPage })));

function PublicShell() {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const isAdmin = location.pathname.startsWith('/admin');
  const isTableOrder = location.pathname.startsWith('/table/');
  const isVendorSettings = location.pathname.startsWith('/settings');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [settings, setSettings] = useState<RestaurantSettings | null>(null);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const lang: Language = i18n.language?.startsWith('zh') ? 'zh' : i18n.language?.startsWith('en') ? 'en' : 'el';
  const restaurantName = settings ? getLocalizedField(lang, { zh: settings.name_zh, en: settings.name_en, el: settings.name_el }) : t('home.title');
  const restaurantAddress = settings ? getLocalizedField(lang, { zh: settings.address_zh, en: settings.address_en, el: settings.address_el }) : '';
  const reservationsEnabled = settings ? getFeatureFlags(settings).reservations : false;

  useEffect(() => {
    let cancelled = false;
    void getPublicRestaurantSettings()
      .then((next) => !cancelled && setSettings(next))
      .catch(() => !cancelled && setSettings(null))
      .finally(() => !cancelled && setSettingsLoaded(true));
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (settings?.brand_color) document.documentElement.style.setProperty('--accent', settings.brand_color);
    else document.documentElement.style.removeProperty('--accent');
    document.title = settings?.meta_title || restaurantName;
    if (!settings?.favicon_url) return;
    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]') || document.createElement('link');
    link.rel = 'icon'; link.href = settings.favicon_url;
    if (!document.querySelector('link[rel="icon"]')) document.head.appendChild(link);
  }, [settings, restaurantName]);

  useEffect(() => { setMobileNavOpen(false); }, [location.pathname, location.hash]);

  if (isAdmin) return <Suspense fallback={null}><AdminPage /></Suspense>;
  if (isVendorSettings) return <Suspense fallback={null}><Routes><Route path="/settings" element={<VendorSettingsPage />} /><Route path="/settings/legal" element={<VendorLegalSettingsPage />} /><Route path="*" element={<Navigate to="/settings" replace />} /></Routes></Suspense>;
  if (isTableOrder) return <Suspense fallback={null}><Routes><Route path="/table/:qrToken" element={<TableOrderPage />} /><Route path="*" element={<Navigate to="/" replace />} /></Routes></Suspense>;

  return <>
    <header className="site-header"><div className="site-header-inner">
      <Link className="brand" to="/"><SafeImage src={settings?.logo_url} optimizedSrc={getOptimizedImageUrl(settings?.logo_url, 'logo')} className="brand-logo" alt="" fallback={<span className="brand-mark">餐</span>} /><span><strong>{restaurantName}</strong>{restaurantAddress ? <small>{restaurantAddress}</small> : null}</span></Link>
      <button className="mobile-nav-toggle" type="button" aria-label={mobileNavOpen ? t('nav.close') : t('nav.open')} aria-expanded={mobileNavOpen} onClick={() => setMobileNavOpen((open) => !open)}>{mobileNavOpen ? <X size={20} /> : <Menu size={20} />}</button>
      <nav className={`nav-links ${mobileNavOpen ? 'is-open' : ''}`} aria-label={t('nav.primary')}><NavLink to="/" end onClick={() => setMobileNavOpen(false)}>{t('nav.home')}</NavLink><NavLink to="/menu" onClick={() => setMobileNavOpen(false)}>{t('nav.menu')}</NavLink><NavLink to="/contact" onClick={() => setMobileNavOpen(false)}>{t('nav.contact')}</NavLink>{reservationsEnabled ? <NavLink className="mobile-nav-reservation" to="/reservations" onClick={() => setMobileNavOpen(false)}><CalendarDays size={17} />{lang === 'zh' ? '预订餐桌' : lang === 'en' ? 'Reserve a table' : 'Κράτηση τραπεζιού'}</NavLink> : null}</nav>
      {mobileNavOpen ? <button className="mobile-nav-backdrop" type="button" aria-label={t('nav.close')} onClick={() => setMobileNavOpen(false)} /> : null}
      <div className="site-header-actions">{reservationsEnabled ? <Link className="header-reservation-button" to="/reservations" aria-label={lang === 'zh' ? '预订餐桌' : lang === 'en' ? 'Reserve a table' : 'Κράτηση τραπεζιού'}><CalendarDays size={17} /><span>{lang === 'zh' ? '预订餐桌' : lang === 'en' ? 'Reserve' : 'Κράτηση'}</span></Link> : null}<LanguageSwitch /></div>
    </div></header>
    <Suspense fallback={null}><Routes><Route path="/" element={<HomePage />} /><Route path="/menu" element={<MenuPage />} /><Route path="/reservations" element={!settingsLoaded || reservationsEnabled ? <ReservationPage /> : <Navigate to="/" replace />} /><Route path="/privacy-policy" element={<LegalPage />} /><Route path="/terms-of-service" element={<LegalPage />} /><Route path="/cookie-policy" element={<LegalPage />} /><Route path="/contact" element={<LegalPage />} /><Route path="/cancellation-policy" element={<LegalPage />} /><Route path="/table/:qrToken" element={<TableOrderPage />} /><Route path="*" element={<Navigate to="/" replace />} /></Routes></Suspense>
    <SiteFooter name={restaurantName} address={restaurantAddress} settings={settings} /><CookieBanner />
  </>;
}

export function App() { return <PublicShell />; }
