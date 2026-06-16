import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { getPublicMenu } from '../lib/menuApi';
import { formatPrice, pickLocalized } from '../lib/localized';
import type { Language, MenuGroup, MenuItem } from '../lib/types';

export function MenuPage() {
  const { t, i18n } = useTranslation();
  const lang = (i18n.language === 'en' ? 'en' : 'el') as Language;
  const [groups, setGroups] = useState<MenuGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getPublicMenu()
      .then(setGroups)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="page-shell">
      <section className="page-heading">
        <h1>{t('nav.menu')}</h1>
        <p>{t('common.priceNote')}</p>
      </section>

      {loading ? <p className="muted">{t('common.loading')}</p> : null}
      {error ? <p className="error-text">{error}</p> : null}
      {!loading && groups.length === 0 ? <p className="muted">{t('common.empty')}</p> : null}

      <div className="menu-layout">
        <aside className="menu-category-rail">
          {groups
            .filter((group) => group.items.length)
            .map((group) => (
              <a href={`#category-${group.id}`} key={group.id}>
                {pickLocalized(lang, {
                  zh: group.name_zh,
                  en: group.name_en,
                  el: group.name_el,
                })}
              </a>
            ))}
        </aside>
        <div className="menu-list-column">
          {groups.map((group) =>
            group.items.length ? (
              <section className="menu-group" id={`category-${group.id}`} key={group.id}>
                <h2>
                  {pickLocalized(lang, {
                    zh: group.name_zh,
                    en: group.name_en,
                    el: group.name_el,
                  })}
                </h2>
                <div className="menu-list">
                  {group.items.map((item) => (
                    <MenuCard item={item} lang={lang} key={item.id} />
                  ))}
                </div>
              </section>
            ) : null,
          )}
        </div>
      </div>
    </main>
  );
}

export function MenuCard({
  item,
  lang,
  action,
}: {
  item: MenuItem;
  lang: Language;
  action?: ReactNode;
}) {
  const name = pickLocalized(lang, {
    zh: item.name_zh,
    en: item.name_en,
    el: item.name_el,
  });
  const description = pickLocalized(lang, {
    zh: item.description_zh,
    en: item.description_en,
    el: item.description_el,
  });

  return (
    <article className="menu-card">
      {item.image_url ? <img src={item.image_url} alt="" loading="lazy" /> : <div className="menu-card-fallback" />}
      <div>
        <div className="menu-card-title">
          <h3>{name}</h3>
          <strong>{formatPrice(Number(item.price))}</strong>
        </div>
        {description ? <p>{description}</p> : null}
        {action}
      </div>
    </article>
  );
}
