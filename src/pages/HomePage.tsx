import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock3, ExternalLink, Instagram, MapPin, MessageCircle, Phone, UtensilsCrossed } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LanguageSwitch } from '../components/LanguageSwitch';
import { MenuCard } from './MenuPage';
import { getPublicMenu, getRestaurantSettings, subscribeToRestaurantSettings } from '../lib/menuApi';
import { getLocalizedField, pickLocalized } from '../lib/localized';
import type { Language, MenuGroup, MenuItem, RestaurantSettings } from '../lib/types';

export function HomePage() {
  const { t, i18n } = useTranslation();
  const lang: Language = i18n.language?.startsWith('zh') ? 'zh' : i18n.language?.startsWith('en') ? 'en' : 'el';
  const [settings, setSettings] = useState<RestaurantSettings | null>(null);
  const [groups, setGroups] = useState<MenuGroup[]>([]);
  const [featuredItems, setFeaturedItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'Wok Dragon';
    Promise.all([
      getRestaurantSettings().then(setSettings).catch((err) => setError(err.message)),
      getPublicMenu()
        .then((menuGroups) => {
          setGroups(menuGroups.filter((group) => group.items.length > 0).slice(0, 8));
          setFeaturedItems(menuGroups.flatMap((group) => group.items).slice(0, 4));
        })
        .catch((err) => setError(err.message)),
    ]).finally(() => setLoading(false));
    return subscribeToRestaurantSettings(setSettings);
  }, []);

  const name = settings
    ? pickLocalized(lang, {
        zh: settings.name_zh,
        en: settings.name_en,
        el: settings.name_el,
      })
    : t('home.title');
  const address = settings
    ? pickLocalized(lang, {
        zh: settings.address_zh,
        en: settings.address_en,
        el: settings.address_el,
      })
    : '';
  const hours = settings
    ? pickLocalized(lang, {
        zh: settings.opening_hours_zh,
        en: settings.opening_hours_en,
        el: settings.opening_hours_el,
      })
    : '';
  const intro = settings
    ? pickLocalized(lang, { zh: settings.intro_zh, en: settings.intro_en, el: settings.intro_el })
    : '';
  const deliveryLinks = [
    { label: t('platforms.wolt'), url: settings?.wolt_url },
    { label: t('platforms.efood'), url: settings?.efood_url },
    { label: t('platforms.box'), url: settings?.box_url },
  ].filter((link) => Boolean(link.url?.trim()));
  const heroItem = featuredItems.find((item) => Boolean(item.image_url));
  const heroImageUrl = settings?.hero_image_url?.trim() || heroItem?.image_url;

  const featuredSection = featuredItems.length === 0 ? null : (
    <section className="home-menu-preview">
      <div className="section-title-row">
        <div>
          <h2>{t('home.featuredTitle')}</h2>
          <p>{t('common.priceNote')}</p>
        </div>
        <Link className="secondary-button" to="/menu">{t('home.menuCta')}</Link>
      </div>
      <div className="home-menu-list">
        {featuredItems.map((item) => <MenuCard item={item} lang={lang} key={item.id} />)}
      </div>
    </section>
  );

  const categoriesSection = groups.length === 0 ? null : (
    <section className="home-category-preview">
      <div className="section-title-row">
        <div>
          <h2>{t('home.categoriesTitle')}</h2>
          <p>{t('home.orderHint')}</p>
        </div>
      </div>
      <div className="home-category-grid">
        {groups.map((group) => (
          <Link className="category-entry" to={`/menu#category-${group.id}`} key={group.id}>
            <strong>{getLocalizedField(lang, { zh: group.name_zh, en: group.name_en, el: group.name_el })}</strong>
            <span>{group.items.length}</span>
          </Link>
        ))}
      </div>
    </section>
  );

  if (loading) {
    return (
      <main>
        <section className="hero-section" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '40vh' }}>
          <p style={{ color: 'var(--color-muted)', fontSize: '18px' }}>{t('common.loading')}</p>
        </section>
      </main>
    );
  }

  return (
    <main>
      <section className="hero-section">
        <div className="hero-copy">
          <div className="hero-brand-lockup" aria-hidden="true">
            {settings?.logo_url ? <img className="brand-logo" src={settings.logo_url} alt="" /> : <span className="brand-mark">餐</span>}
            <strong>{name}</strong>
          </div>
          <h1>{name || 'Wok Dragon'}</h1>
          <p>{intro || t('home.subtitle')}</p>
          <div className="hero-actions">
            <Link className="primary-button" to="/menu"><UtensilsCrossed size={18} />{t('home.menuCta')}</Link>
            {settings?.map_url ? <a className="secondary-button" href={settings.map_url} target="_blank" rel="noreferrer"><MapPin size={18} />{t('common.viewMap')}</a> : null}
          </div>
          <p className="muted">{t('home.orderHint')}</p>
          {error ? <p className="error-text">{error}</p> : null}
        </div>
        <div className="hero-media">
          {heroImageUrl ? (
            <img src={heroImageUrl} alt={name} />
          ) : <div className="hero-image-fallback" aria-hidden="true"><div className="hif-inner"><span className="hif-mark">火</span><strong>Wok Dragon</strong><small>Express</small><span className="hif-sub">{lang === 'el' ? 'Γρήγορο Wok · Ζεστή Φιλοξενία' : 'Fast Wok · Warm Hospitality'}</span></div></div>}
        </div>
      </section>

      <section className="home-selling-points">
        <div className="selling-point"><span className="sp-icon">🔥</span><strong>{lang === 'el' ? 'Γρήγορο Wok' : 'Fast Wok'}</strong><p>{lang === 'el' ? 'Φρέσκα υλικά, γρήγορη προετοιμασία' : 'Fresh ingredients, quick preparation'}</p></div>
        <div className="selling-point"><span className="sp-icon">🏠</span><strong>{lang === 'el' ? 'Φαγητό στο κατάστημα' : 'Dine-in & Takeaway'}</strong><p>{lang === 'el' ? 'Απολαύστε στο εστιατόριο ή πάρτε στο σπίτι' : 'Enjoy in our restaurant or take away'}</p></div>
        <div className="selling-point"><span className="sp-icon">📱</span><strong>{lang === 'el' ? 'Παραγγελία QR' : 'QR Ordering'}</strong><p>{lang === 'el' ? 'Σαρώστε, επιλέξτε, παραγγείλτε' : 'Scan, choose, order from your table'}</p></div>
      </section>

      <section className="home-intro">
        <div>
          <h2>{t('home.introTitle')}</h2>
          <p>{intro || t('home.introText')}</p>
        </div>
        <div className="home-info-cards">
          {address ? <div><span><MapPin size={15} /> {t('common.address')}</span><strong>{address}</strong></div> : null}
          {hours ? <div><span><Clock3 size={15} /> {t('common.openingHours')}</span><strong>{hours}</strong></div> : null}
          {settings?.phone ? <div><span><Phone size={15} /> {t('common.phone')}</span><a href={`tel:${settings.phone}`}>{settings.phone}</a></div> : null}
        </div>
      </section>

      {featuredSection}

      <section className="home-order-guide">
        <h2>{lang === 'el' ? 'Παραγγελία από το τραπέζι' : 'Order from your table'}</h2>
        <div className="order-steps">
          <div className="order-step"><span>1</span><strong>{lang === 'el' ? 'Σαρώστε το QR' : 'Scan QR code'}</strong><p>{lang === 'el' ? 'Στο τραπέζι σας' : 'On your table'}</p></div>
          <div className="order-step"><span>2</span><strong>{lang === 'el' ? 'Επιλέξτε πιάτα' : 'Choose dishes'}</strong><p>{lang === 'el' ? 'Από το μενού' : 'From the menu'}</p></div>
          <div className="order-step"><span>3</span><strong>{lang === 'el' ? 'Στείλτε παραγγελία' : 'Send order'}</strong><p>{lang === 'el' ? 'Καλή όρεξη!' : 'Enjoy!'}</p></div>
        </div>
      </section>

      {categoriesSection}

      <section className="info-band" id="contact">
        {address ? <div><span>{t('common.address')}</span><strong>{address}</strong></div> : null}
        {hours ? <div><span>{t('common.openingHours')}</span><strong>{hours}</strong></div> : null}
        <div className="contact-actions">
          <span>{t('nav.contact')}</span>
          {settings?.phone ? <a href={`tel:${settings.phone}`}>{settings.phone}</a> : null}
          {settings?.whatsapp_url ? <a className="outline-button" href={settings.whatsapp_url} target="_blank" rel="noreferrer"><MessageCircle size={15} />WhatsApp</a> : null}
          {settings?.instagram_url ? <a className="outline-button" href={settings.instagram_url} target="_blank" rel="noreferrer"><Instagram size={15} />Instagram</a> : null}
          {settings?.map_url ? <a className="outline-button" href={settings.map_url} target="_blank" rel="noreferrer"><MapPin size={15} />{t('common.viewMap')}</a> : null}
        </div>
        <div className="platforms">
          <span>{t('common.delivery')}</span>
          <div>{deliveryLinks.length ? deliveryLinks.map((link) => <PlatformButton label={link.label} url={link.url} key={link.label} />) : <span className="delivery-placeholder">{t('home.deliveryUnavailable')}</span>}</div>
        </div>
      </section>

      <footer className="site-footer">
        <strong>{name || 'Wok Dragon'}</strong>
        {address ? <p>{address}</p> : null}
        <small>© {new Date().getFullYear()}</small>
      </footer>

    </main>
  );
}

function PlatformButton({ label, url }: { label: string; url?: string | null }) {
  return (
    <a className="outline-button" href={url ?? '#'} target="_blank" rel="noopener noreferrer">
      {label}
      <ExternalLink size={14} />
    </a>
  );
}
