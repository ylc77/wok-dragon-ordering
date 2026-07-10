import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ImageIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SafeImage } from './SafeImage';
import { getOptimizedImageUrl } from '../lib/imageUrl';
import { formatPrice, getLocalizedField } from '../lib/localized';
import { getMenuDisplayImage } from '../lib/templateMenuImages';
import type { Language, MenuItem } from '../lib/types';

export function MenuCard({
  item,
  lang,
  action,
  priorityImage = false,
}: {
  item: MenuItem;
  lang: Language;
  action?: ReactNode;
  priorityImage?: boolean;
}) {
  const { t } = useTranslation();
  const name = getLocalizedField(lang, { zh: item.name_zh, en: item.name_en, el: item.name_el });
  const desc = getLocalizedField(lang, { zh: item.description_zh, en: item.description_en, el: item.description_el });
  return (
    <article className={`menu-card${item.is_sold_out ? ' sold-out' : ''}`}>
      <DishImage item={item} alt={name} priority={priorityImage} />
      {item.is_sold_out ? <span className="sold-out-badge">{t('common.soldOut')}</span> : null}
      <div>
        <div className="menu-card-title"><h3>{name}</h3><strong>{formatPrice(Number(item.price), lang)}</strong></div>
        {desc ? <p>{desc}</p> : null}
        {action}
      </div>
    </article>
  );
}

export function DishImage({ item, alt, priority = false }: { item: MenuItem; alt: string; priority?: boolean }) {
  const [shouldLoad, setShouldLoad] = useState(priority);
  const placeholderRef = useRef<HTMLDivElement | null>(null);
  const imageUrl = getMenuDisplayImage(item.image_url, item.name_en);
  const optimizedImageUrl = getOptimizedImageUrl(imageUrl, 'card');

  useEffect(() => {
    setShouldLoad(priority);
  }, [imageUrl, priority]);

  useEffect(() => {
    if (priority || !imageUrl || shouldLoad) return;
    if (typeof IntersectionObserver === 'undefined') {
      setShouldLoad(true);
      return;
    }
    const target = placeholderRef.current;
    if (!target) {
      setShouldLoad(true);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setShouldLoad(true);
        observer.disconnect();
      }
    }, { rootMargin: '120px 0px' });
    observer.observe(target);
    return () => observer.disconnect();
  }, [imageUrl, priority, shouldLoad]);

  const fallback = <div className="menu-card-fallback" aria-hidden="true"><span className="mcf-icon"><ImageIcon size={28} /></span></div>;

  if (imageUrl && !shouldLoad) {
    return (
      <div ref={placeholderRef} className="menu-card-fallback" aria-hidden="true">
        <span className="mcf-icon"><ImageIcon size={28} /></span>
      </div>
    );
  }

  return (
    <SafeImage
      src={imageUrl}
      optimizedSrc={optimizedImageUrl}
      alt={alt}
      width="118"
      height="118"
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      fetchPriority={priority ? 'high' : 'auto'}
      sizes="118px"
      fallback={fallback}
    />
  );
}
