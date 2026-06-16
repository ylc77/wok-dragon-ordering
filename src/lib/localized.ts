import type { Language } from './types';

export function pickLocalized(
  lang: Language,
  values: { zh?: string | null; en?: string | null; el?: string | null },
) {
  if (lang === 'el') {
    return values.el || values.en || values.zh || '';
  }
  return values.en || values.el || values.zh || '';
}

export function formatPrice(price: number) {
  return new Intl.NumberFormat('el-GR', {
    style: 'currency',
    currency: 'EUR',
  }).format(price);
}
