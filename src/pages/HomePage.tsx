import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock3, ExternalLink, MapPin, Phone, UtensilsCrossed } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { MenuCard } from './MenuPage';
import { getPublicMenu, getRestaurantSettings } from '../lib/menuApi';
import { getLocalizedField, pickLocalized } from '../lib/localized';
import type { Language, MenuGroup, MenuItem, RestaurantSettings } from '../lib/types';

export function HomePage() {
  const { t, i18n } = useTranslation();
  const lang = (i18n.language === 'en' ? 'en' : 'el') as Language;
  const [settings, setSettings] = useState<RestaurantSettings | null>(null);
  const [groups, setGroups] = useState<MenuGroup[]>([]);
  const [featuredItems, setFeaturedItems] = useState<MenuItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getRestaurantSettings().then(setSettings).catch((err) => setError(err.message));
    getPublicMenu()
      .then((menuGroups) => {
        setGroups(menuGroups.filter((group) => group.items.length > 0).slice(0, 8));
        setFeaturedItems(menuGroups.flatMap((group) => group.items).slice(0, 4));
      })
      .catch((err) => setError(err.message));
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
    : 'Mitropoleos 51, Monastiraki, 10556 Athens, Greece';
  const hours = settings
    ? pickLocalized(lang, {
        zh: settings.opening_hours_zh,
        en: settings.opening_hours_en,
        el: settings.opening_hours_el,
      })
    : '12:00-23:00';
  const deliveryLinks = [
    { label: t('platforms.wolt'), url: settings?.wolt_url },
    { label: t('platforms.efood'), url: settings?.efood_url },
    { label: t('platforms.box'), url: settings?.box_url },
  ].filter((link) => Boolean(link.url?.trim()));
  const heroItem = featuredItems.find((item) => Boolean(item.image_url));

  return (
    <main>
      <section className="hero-section">
        <div className="hero-copy">
          <div className="hero-brand-lockup" aria-hidden="true">
            <span className="brand-mark">龙</span>
            <strong>Wok Dragon Express</strong>
          </div>
          <h1>{name}</h1>
          <p>{t('home.subtitle')}</p>
          <div className="hero-actions">
            <Link className="primary-button" to="/menu">
              <UtensilsCrossed size={18} />
              {t('home.menuCta')}
            </Link>
            {settings?.map_url ? (
              <a className="secondary-button" href={settings.map_url} target="_blank" rel="noreferrer">
                <MapPin size={18} />
                {t('common.viewMap')}
              </a>
            ) : null}
          </div>
          <p className="muted">{t('home.orderHint')}</p>
          {error ? <p className="error-text">{error}</p> : null}
        </div>
        <div className="hero-media">
          {heroItem?.image_url ? (
            <img src={heroItem.image_url} alt={getLocalizedField(lang, {
              zh: heroItem.name_zh,
              en: heroItem.name_en,
              el: heroItem.name_el,
            })} />
          ) : <div className="hero-image-fallback" aria-hidden="true">龙</div>}
        </div>
      </section>

      <section className="home-intro">
        <div>
          <h2>{t('home.introTitle')}</h2>
          <p>{t('home.introText')}</p>
        </div>
        <div className="home-info-cards">
          <div>
            <span><MapPin size={15} /> {t('common.address')}</span>
            <strong>{address}</strong>
          </div>
          <div>
            <span><Clock3 size={15} /> {t('common.openingHours')}</span>
            <strong>{hours}</strong>
          </div>
          {settings?.phone ? (
            <div>
              <span><Phone size={15} /> {t('common.phone')}</span>
              <a href={`tel:${settings.phone}`}>{settings.phone}</a>
            </div>
          ) : null}
        </div>
      </section>

      <section className="home-menu-preview">
        <div className="section-title-row">
          <div>
            <h2>{t('home.featuredTitle')}</h2>
            <p>{t('common.priceNote')}</p>
          </div>
          <Link className="secondary-button" to="/menu">
            {t('home.menuCta')}
          </Link>
        </div>
        <div className="home-menu-list">
          {featuredItems.map((item) => (
            <MenuCard item={item} lang={lang} key={item.id} />
          ))}
        </div>
      </section>

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
              <strong>
                {getLocalizedField(lang, {
                  zh: group.name_zh,
                  en: group.name_en,
                  el: group.name_el,
                })}
              </strong>
              <span>{group.items.length}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="info-band" id="contact">
        <div>
          <span>{t('common.address')}</span>
          <strong>{address}</strong>
        </div>
        <div>
          <span>{t('common.openingHours')}</span>
          <strong>{hours}</strong>
        </div>
        <div className="contact-actions">
          <span>{t('nav.contact')}</span>
          {settings?.phone ? <a href={`tel:${settings.phone}`}>{settings.phone}</a> : null}
          {settings?.map_url ? (
            <a className="outline-button" href={settings.map_url} target="_blank" rel="noreferrer">
              <MapPin size={15} />
              {t('common.viewMap')}
            </a>
          ) : null}
        </div>
        <div className="platforms">
          <span>{t('common.delivery')}</span>
          <div>
            {deliveryLinks.length ? (
              deliveryLinks.map((link) => <PlatformButton label={link.label} url={link.url} key={link.label} />)
            ) : (
              <span className="delivery-placeholder">{t('home.deliveryUnavailable')}</span>
            )}
          </div>
        </div>
      </section>
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
