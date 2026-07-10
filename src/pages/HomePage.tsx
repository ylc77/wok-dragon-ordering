import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, Clock3, ExternalLink, Flame, Instagram, MapPin, MessageCircle, Phone, QrCode, Store, UtensilsCrossed } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { MenuCard } from '../components/MenuCard';
import { SafeImage } from '../components/SafeImage';
import { getFeatureFlags } from '../lib/featureFlags';
import { getOptimizedImageUrl } from '../lib/imageUrl';
import { getLocalizedField, pickLocalized } from '../lib/localized';
import { getHomeMenuPreview } from '../lib/publicMenuApi';
import { getPublicRestaurantSettings } from '../lib/publicRestaurantApi';
import type { Language, MenuGroup, MenuItem, RestaurantSettings } from '../lib/types';

const reservationCopy = {
  zh: { eyebrow: '在线预订', title: '提前预订，轻松到店', body: '选择日期、时间和人数，即刻确认您的餐桌。', action: '预订餐桌' },
  en: { eyebrow: 'ONLINE RESERVATION', title: 'Reserve ahead, arrive with ease', body: 'Choose a date, time, and party size for an instant confirmation.', action: 'Reserve a table' },
  el: { eyebrow: 'ONLINE ΚΡΑΤΗΣΗ', title: 'Κρατήστε τραπέζι, ελάτε με άνεση', body: 'Επιλέξτε ημερομηνία, ώρα και άτομα για άμεση επιβεβαίωση.', action: 'Κράτηση τραπεζιού' },
} as const;

export function HomePage() {
  const { t, i18n } = useTranslation();
  const lang: Language = i18n.language?.startsWith('zh') ? 'zh' : i18n.language?.startsWith('en') ? 'en' : 'el';
  const [settings, setSettings] = useState<RestaurantSettings | null>(null);
  const [groups, setGroups] = useState<MenuGroup[]>([]);
  const [featuredItems, setFeaturedItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      getPublicRestaurantSettings().then((next) => !cancelled && setSettings(next)),
      getHomeMenuPreview(4).then(({ groups: menuGroups, featuredItems: previewItems }) => {
        if (cancelled) return;
        setGroups(menuGroups.filter((group) => (group.item_count ?? group.items.length) > 0).slice(0, 8));
        setFeaturedItems(previewItems);
      }),
    ]).catch((reason) => !cancelled && setError(reason instanceof Error ? reason.message : 'Unable to load restaurant information.'))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, []);

  const name = settings ? pickLocalized(lang, { zh: settings.name_zh, en: settings.name_en, el: settings.name_el }) : t('home.title');
  useEffect(() => { document.title = name || 'Restaurant'; }, [name]);

  const address = settings ? pickLocalized(lang, { zh: settings.address_zh, en: settings.address_en, el: settings.address_el }) : '';
  const hours = settings ? pickLocalized(lang, { zh: settings.opening_hours_zh, en: settings.opening_hours_en, el: settings.opening_hours_el }) : '';
  const intro = settings ? pickLocalized(lang, { zh: settings.intro_zh, en: settings.intro_en, el: settings.intro_el }) : '';
  const deliveryLinks = [{ label: t('platforms.wolt'), url: settings?.wolt_url }, { label: t('platforms.efood'), url: settings?.efood_url }, { label: t('platforms.box'), url: settings?.box_url }].filter((link) => Boolean(link.url?.trim()));
  const heroItem = featuredItems.find((item) => Boolean(item.image_url));
  const heroImageUrl = settings?.hero_image_url?.trim() || heroItem?.image_url;
  const reservationsEnabled = settings ? getFeatureFlags(settings).reservations : false;
  const reserve = reservationCopy[lang];

  if (loading) return <main className="home-page"><section className="app-state-card home-loading-card"><span className="state-spinner" aria-hidden="true" /><strong>{t('common.loading')}</strong><p>{t('home.subtitle')}</p></section></main>;

  return <main className="home-page">
    <section className="hero-section">
      <div className="hero-copy">
        <div className="hero-brand-lockup" aria-hidden="true"><SafeImage src={settings?.logo_url} optimizedSrc={getOptimizedImageUrl(settings?.logo_url, 'logo')} className="brand-logo" alt="" fallback={<span className="brand-mark"><UtensilsCrossed size={22} /></span>} /><strong>{name}</strong></div>
        <p className="home-kicker">{lang === 'zh' ? '新鲜现炒 · 轻松用餐' : lang === 'en' ? 'FRESH WOK · EASY DINING' : 'ΦΡΕΣΚΟ WOK · ΑΠΟΛΑΥΣΤΙΚΟ ΦΑΓΗΤΟ'}</p>
        <h1>{name || t('home.title')}</h1><p>{intro || t('home.subtitle')}</p>
        <div className="hero-actions"><Link className="primary-button" to="/menu"><UtensilsCrossed size={18} />{t('home.menuCta')}</Link>{reservationsEnabled ? <Link className="secondary-button" to="/reservations"><CalendarDays size={18} />{reserve.action}</Link> : null}{settings?.map_url ? <a className="secondary-button" href={settings.map_url} target="_blank" rel="noreferrer"><MapPin size={18} />{t('common.viewMap')}</a> : null}</div>
        {settings?.enable_qr_ordering !== false ? <p className="muted">{t('home.orderHint')}</p> : null}{error ? <p className="error-text">{error}</p> : null}
      </div>
      <div className="hero-media"><SafeImage src={heroImageUrl} optimizedSrc={getOptimizedImageUrl(heroImageUrl, 'hero')} alt={name} loading="eager" decoding="async" fetchPriority="high" sizes="(max-width: 768px) 100vw, 52vw" fallback={<div className="hero-image-fallback" aria-hidden="true"><div className="hif-inner"><span className="hif-mark"><UtensilsCrossed size={96} /></span><strong>{name || t('home.title')}</strong><span className="hif-sub">{t('home.subtitle')}</span></div></div>} /></div>
    </section>

    <section className="home-selling-points"><SellingPoint icon={<Flame size={22} />} title={t('home.fastWokTitle')} text={t('home.fastWokText')} /><SellingPoint icon={<Store size={22} />} title={t('home.dineTakeawayTitle')} text={t('home.dineTakeawayText')} /><SellingPoint icon={<QrCode size={22} />} title={t('home.qrOrderingTitle')} text={t('home.qrOrderingText')} /></section>

    <section className="home-intro"><div><p className="section-kicker">{lang === 'zh' ? '关于我们' : lang === 'en' ? 'OUR TABLE' : 'ΤΟ ΤΡΑΠΕΖΙ ΜΑΣ'}</p><h2>{t('home.introTitle')}</h2><p>{intro || t('home.introText')}</p></div><div className="home-info-cards">{address ? <div><span><MapPin size={15} /> {t('common.address')}</span><strong>{address}</strong></div> : null}{hours ? <div><span><Clock3 size={15} /> {t('common.openingHours')}</span><strong>{hours}</strong></div> : null}{settings?.phone ? <div><span><Phone size={15} /> {t('common.phone')}</span><a href={`tel:${settings.phone}`}>{settings.phone}</a></div> : null}</div></section>

    {featuredItems.length ? <section className="home-menu-preview"><div className="section-title-row"><div><p className="section-kicker">{lang === 'zh' ? '本店推荐' : lang === 'en' ? 'HOUSE FAVOURITES' : 'ΑΓΑΠΗΜΕΝΑ ΠΙΑΤΑ'}</p><h2>{t('home.featuredTitle')}</h2><p>{t('common.priceNote')}</p></div><Link className="secondary-button" to="/menu">{t('home.menuCta')}</Link></div><div className="home-menu-list">{featuredItems.map((item) => <MenuCard item={item} lang={lang} key={item.id} />)}</div></section> : null}

    {reservationsEnabled ? <section className="home-reservation-cta"><div><p>{reserve.eyebrow}</p><h2>{reserve.title}</h2><span>{reserve.body}</span></div><Link className="primary-button" to="/reservations"><CalendarDays size={18} />{reserve.action}</Link></section> : null}

    <section className="home-order-guide"><p className="section-kicker">{lang === 'zh' ? '扫码点餐' : lang === 'en' ? 'ORDER AT THE TABLE' : 'ΠΑΡΑΓΓΕΛΙΑ ΣΤΟ ΤΡΑΠΕΖΙ'}</p><h2>{t('home.orderGuideTitle')}</h2><div className="order-steps"><OrderStep number="1" title={t('home.stepScanTitle')} text={t('home.stepScanText')} /><OrderStep number="2" title={t('home.stepChooseTitle')} text={t('home.stepChooseText')} /><OrderStep number="3" title={t('home.stepSendTitle')} text={t('home.stepSendText')} /></div></section>

    {groups.length ? <section className="home-category-preview"><div className="section-title-row"><div><p className="section-kicker">{lang === 'zh' ? '菜单分类' : lang === 'en' ? 'EXPLORE THE MENU' : 'ΕΞΕΡΕΥΝΗΣΤΕ ΤΟ ΜΕΝΟΥ'}</p><h2>{t('home.categoriesTitle')}</h2>{settings?.enable_qr_ordering !== false ? <p>{t('home.orderHint')}</p> : null}</div></div><div className="home-category-grid">{groups.map((group) => <Link className="category-entry" to={`/menu#category-${group.id}`} key={group.id}><strong>{getLocalizedField(lang, { zh: group.name_zh, en: group.name_en, el: group.name_el })}</strong><span>{group.item_count ?? group.items.length}</span></Link>)}</div></section> : null}

    <section className="info-band" id="contact">{address ? <div><span>{t('common.address')}</span><strong>{address}</strong></div> : null}{hours ? <div><span>{t('common.openingHours')}</span><strong>{hours}</strong></div> : null}<div className="contact-actions"><span>{t('nav.contact')}</span>{settings?.phone ? <a href={`tel:${settings.phone}`}>{settings.phone}</a> : null}{settings?.whatsapp_url ? <a className="outline-button" href={settings.whatsapp_url} target="_blank" rel="noreferrer"><MessageCircle size={15} />WhatsApp</a> : null}{settings?.instagram_url ? <a className="outline-button" href={settings.instagram_url} target="_blank" rel="noreferrer"><Instagram size={15} />Instagram</a> : null}{settings?.map_url ? <a className="outline-button" href={settings.map_url} target="_blank" rel="noreferrer"><MapPin size={15} />{t('common.viewMap')}</a> : null}</div><div className="platforms"><span>{t('common.delivery')}</span><div>{deliveryLinks.length ? deliveryLinks.map((link) => <a className="outline-button" href={link.url ?? '#'} target="_blank" rel="noopener noreferrer" key={link.label}>{link.label}<ExternalLink size={14} /></a>) : <span className="delivery-placeholder">{t('home.deliveryUnavailable')}</span>}</div></div></section>
  </main>;
}

function SellingPoint({ icon, title, text }: { icon: ReactNode; title: string; text: string }) { return <div className="selling-point"><span className="sp-icon">{icon}</span><strong>{title}</strong><p>{text}</p></div>; }
function OrderStep({ number, title, text }: { number: string; title: string; text: string }) { return <div className="order-step"><span>{number}</span><strong>{title}</strong><p>{text}</p></div>; }
