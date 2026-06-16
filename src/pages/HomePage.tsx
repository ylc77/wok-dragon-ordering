import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, MapPin, UtensilsCrossed } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { MenuCard } from './MenuPage';
import { getPublicMenu, getRestaurantSettings } from '../lib/menuApi';
import { pickLocalized } from '../lib/localized';
import type { Language, MenuItem, RestaurantSettings } from '../lib/types';

export function HomePage() {
  const { t, i18n } = useTranslation();
  const lang = (i18n.language === 'en' ? 'en' : 'el') as Language;
  const [settings, setSettings] = useState<RestaurantSettings | null>(null);
  const [featuredItems, setFeaturedItems] = useState<MenuItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getRestaurantSettings().then(setSettings).catch((err) => setError(err.message));
    getPublicMenu()
      .then((groups) => setFeaturedItems(groups.flatMap((group) => group.items).slice(0, 6)))
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

  return (
    <main>
      <section className="hero-section">
        <div className="hero-copy">
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
        <div className="hero-media" aria-hidden="true">
          <div className="dish-photo photo-one" />
          <div className="dish-photo photo-two" />
          <div className="dish-photo photo-three" />
        </div>
      </section>

      <section className="home-menu-preview">
        <div className="section-title-row">
          <div>
            <h2>{t('nav.menu')}</h2>
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

      <section className="info-band" id="contact">
        <div>
          <span>{t('common.address')}</span>
          <strong>{address}</strong>
        </div>
        <div>
          <span>{t('common.openingHours')}</span>
          <strong>{hours}</strong>
        </div>
        <div className="platforms">
          <span>{t('common.delivery')}</span>
          <div>
            <PlatformButton label={t('platforms.wolt')} url={settings?.wolt_url} />
            <PlatformButton label={t('platforms.efood')} url={settings?.efood_url} />
            <PlatformButton label={t('platforms.box')} url={settings?.box_url} />
          </div>
        </div>
      </section>
    </main>
  );
}

function PlatformButton({ label, url }: { label: string; url?: string | null }) {
  if (!url) {
    return (
      <button className="outline-button" type="button" disabled>
        {label}
      </button>
    );
  }

  return (
    <a className="outline-button" href={url} target="_blank" rel="noreferrer">
      {label}
      <ExternalLink size={14} />
    </a>
  );
}
