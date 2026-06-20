import type { Language } from './types';

export function pickLocalized(
  lang: Language,
  values: { zh?: string | null; en?: string | null; el?: string | null },
) {
  return getLocalizedField(lang, values);
}

export function getLocalizedField(
  lang: Language,
  values: { zh?: string | null; en?: string | null; el?: string | null },
) {
  if (lang === 'el') {
    return values.el || values.en || values.zh || '';
  }
  return values.en || values.zh || '';
}

export function formatPrice(price: number, lang?: Language) {
  const locale = lang === 'el' ? 'el-GR' : 'en-GB';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'EUR',
  }).format(price);
}
