import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock3, ExternalLink, Instagram, MapPin, MessageCircle, Phone, UtensilsCrossed, ArrowRight, QrCode } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LanguageSwitch } from '../components/LanguageSwitch';
import { SafeImage } from '../components/SafeImage';
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
    Promise.all([
      getRestaurantSettings().then(setSettings).catch((err) => setError(err.message)),
      getPublicMenu()
        .then((menuGroups) => {
          setGroups(menuGroups.filter((group) => group.items.length > 0).slice(0, 6));
          setFeaturedItems(menuGroups.flatMap((group) => group.items).filter((item) => item.image_url).slice(0, 4));
        })
        .catch((err) => setError(err.message)),
    ]).finally(() => setLoading(false));
    return subscribeToRestaurantSettings(setSettings);
  }, []);

  const name = settings
    ? pickLocalized(lang, { zh: settings.name_zh, en: settings.name_en, el: settings.name_el })
    : t('home.title');
  useEffect(() => { document.title = name || 'Restaurant'; }, [name]);

  const address = settings ? pickLocalized(lang, { zh: settings.address_zh, en: settings.address_en, el: settings.address_el }) : '';
  const hours = settings ? pickLocalized(lang, { zh: settings.opening_hours_zh, en: settings.opening_hours_en, el: settings.opening_hours_el }) : '';
  const intro = settings ? pickLocalized(lang, { zh: settings.intro_zh, en: settings.intro_en, el: settings.intro_el }) : '';
  const heroImageUrl = settings?.hero_image_url?.trim() || featuredItems.find((item) => Boolean(item.image_url))?.image_url;
  const deliveryLinks = [
    { label: t('platforms.wolt'), url: settings?.wolt_url },
    { label: t('platforms.efood'), url: settings?.efood_url },
    { label: t('platforms.box'), url: settings?.box_url },
  ].filter((link) => Boolean(link.url?.trim()));

  if (loading) {
    return (
      <main>
        <section className="hero-section" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '40vh' }}>
          <p style={{ fontSize: 18, opacity: .6 }}>{t('common.loading')}</p>
        </section>
      </main>
    );
  }

  return (
    <main>
      {/* ═══ Hero ═══ */}
      <section className="hero-section">
        <div className="hero-copy">
          <div className="hero-brand-row">
            <SafeImage src={settings?.logo_url} className="brand-logo" alt="" fallback={<span className="brand-mark">餐</span>} />
            <strong>{name}</strong>
          </div>
          <h1>{intro ? intro.slice(0, 60) : t('home.heroTitle')}</h1>
          <p className="hero-lead">{t('home.heroSubtitle')}</p>
          <div className="hero-actions">
            <Link className="primary-button hero-btn" to="/menu"><UtensilsCrossed size={18} />{t('home.menuCta')}</Link>
            <a className="secondary-button hero-btn" href="#how-to-order"><ArrowRight size={18} />{t('home.orderCta')}</a>
          </div>
          {error ? <p className="error-text" style={{ marginTop: 12 }}>{error}</p> : null}
        </div>
        <div className="hero-media">
          <SafeImage
            src={heroImageUrl}
            alt={name}
            fallback={
              <div className="hero-image-fallback" aria-hidden="true">
                <span className="hif-mark">餐</span>
                <strong>{name || t('home.title')}</strong>
              </div>
            }
          />
        </div>
      </section>

      {/* ═══ Selling Points ═══ */}
      <section className="home-selling-points">
        <div className="selling-point"><span className="sp-icon">🔥</span><strong>{lang === 'el' ? 'Γρήγορο Wok' : 'Fast Wok'}</strong><p>{lang === 'el' ? 'Φρέσκα υλικά, γρήγορη προετοιμασία' : 'Fresh ingredients, quick preparation'}</p></div>
        <div className="selling-point"><span className="sp-icon">🏠</span><strong>{lang === 'el' ? 'Φαγητό στο κατάστημα' : 'Dine-in & Takeaway'}</strong><p>{lang === 'el' ? 'Απολαύστε στο εστιατόριο ή πάρτε στο σπίτι' : 'Enjoy in our restaurant or take away'}</p></div>
        <div className="selling-point"><span className="sp-icon">📱</span><strong>{lang === 'el' ? 'Παραγγελία QR' : 'QR Ordering'}</strong><p>{lang === 'el' ? 'Σαρώστε, επιλέξτε, παραγγείλτε' : 'Scan, choose, order from your table'}</p></div>
      </section>

      {/* ═══ Popular Dishes ═══ */}
      {featuredItems.length > 0 ? (
        <section className="home-section">
          <div className="section-head">
            <h2>{t('home.featuredTitle')}</h2>
            <Link className="text-link" to="/menu">{t('home.menuCta')} <ArrowRight size={14} /></Link>
          </div>
          <div className="home-menu-list">
            {featuredItems.map((item) => <MenuCard item={item} lang={lang} key={item.id} />)}
          </div>
        </section>
      ) : null}

      {/* ═══ How to Order ═══ */}
      {settings?.enable_qr_ordering !== false ? (
        <section className="home-section home-order-guide" id="how-to-order">
          <div className="section-head"><h2>{t('home.howToOrder')}</h2></div>
          <div className="order-steps">
            {[t('home.orderStep1'), t('home.orderStep2'), t('home.orderStep3'), t('home.orderStep4'), t('home.orderStep5')].map((step, i) => (
              <div className="order-step" key={i}><span>{i + 1}</span><strong>{step}</strong></div>
            ))}
          </div>
          <div style={{ textAlign: 'center', marginTop: 24 }}>
            <a className="secondary-button" href="/table/table-01-demo-token"><QrCode size={16} />{t('home.tryDemo')}</a>
          </div>
        </section>
      ) : null}

      {/* ═══ Categories ═══ */}
      {groups.length > 0 ? (
        <section className="home-section">
          <div className="section-head">
            <h2>{t('home.categoriesTitle')}</h2>
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
      ) : null}

      {/* ═══ Visit Us ═══ */}
      {(address || hours || settings?.phone) ? (
        <section className="home-section" id="contact">
          <div className="section-head"><h2>{t('home.visitUs')}</h2></div>
          <div className="home-info-cards">
            {address ? <div><span><MapPin size={15} /> {t('common.address')}</span><strong>{address}</strong></div> : null}
            {hours ? <div><span><Clock3 size={15} /> {t('common.openingHours')}</span><strong>{hours}</strong></div> : null}
            {settings?.phone ? <div><span><Phone size={15} /> {t('common.phone')}</span><a href={`tel:${settings.phone}`}>{settings.phone}</a></div> : null}
          </div>
          <div className="contact-actions">
            {settings?.whatsapp_url ? <a className="outline-button" href={settings.whatsapp_url} target="_blank" rel="noreferrer"><MessageCircle size={15} />WhatsApp</a> : null}
            {settings?.instagram_url ? <a className="outline-button" href={settings.instagram_url} target="_blank" rel="noreferrer"><Instagram size={15} />Instagram</a> : null}
            {settings?.map_url ? <a className="outline-button" href={settings.map_url} target="_blank" rel="noreferrer"><MapPin size={15} />{t('common.viewMap')}</a> : null}
          </div>
        </section>
      ) : null}

      {/* ═══ Delivery ═══ */}
      {deliveryLinks.length > 0 ? (
        <section className="home-section">
          <div className="section-head"><h2>{t('home.delivery')}</h2></div>
          <div className="delivery-links">
            {deliveryLinks.map((link) => (
              <a className="outline-button" href={link.url!} target="_blank" rel="noopener noreferrer" key={link.label}>
                {link.label}<ExternalLink size={14} />
              </a>
            ))}
          </div>
        </section>
      ) : null}

      <footer className="site-footer">
        <strong>{name || t('home.title')}</strong>
        {address ? <p>{address}</p> : null}
        <small>© {new Date().getFullYear()}</small>
      </footer>
    </main>
  );
}
