import i18n from 'i18next';

export const supportedLanguages = ['el', 'en', 'zh'] as const;
export type SupportedLanguage = (typeof supportedLanguages)[number];

export const fallbackLanguage: SupportedLanguage = 'el';
export const fallbackLanguages: SupportedLanguage[] = ['en', 'zh', 'el'];
export const languageStorageKey = 'i18nextLng';

type LanguageResource = {
  translation: Record<string, unknown>;
};

const languageLoaders: Record<SupportedLanguage, () => Promise<LanguageResource>> = {
  el: () => import('./locales/el').then((mod) => mod.default),
  en: () => import('./locales/en').then((mod) => mod.default),
  zh: () => import('./locales/zh').then((mod) => mod.default),
};

const loadedLanguages = new Set<SupportedLanguage>();

export function normalizeLanguage(lng?: string | null): SupportedLanguage {
  const value = lng?.toLowerCase() ?? '';
  if (value.startsWith('zh')) return 'zh';
  if (value.startsWith('en')) return 'en';
  if (value.startsWith('el') || value.startsWith('gr')) return 'el';
  return fallbackLanguage;
}

export function getInitialLanguage(): SupportedLanguage {
  if (typeof window === 'undefined') return fallbackLanguage;
  const stored = window.localStorage.getItem(languageStorageKey);
  if (stored) return normalizeLanguage(stored);
  return fallbackLanguage;
}

export async function loadLanguageBundle(lng: string): Promise<{ lng: SupportedLanguage; resource: LanguageResource }> {
  const normalized = normalizeLanguage(lng);
  try {
    return { lng: normalized, resource: await languageLoaders[normalized]() };
  } catch (error) {
    if (normalized === fallbackLanguage) throw error;
    return { lng: fallbackLanguage, resource: await languageLoaders[fallbackLanguage]() };
  }
}

export function markLanguageLoaded(lng: SupportedLanguage) {
  loadedLanguages.add(lng);
}

export async function ensureLanguageLoaded(lng: string): Promise<SupportedLanguage> {
  const normalized = normalizeLanguage(lng);
  if (loadedLanguages.has(normalized) || i18n.hasResourceBundle(normalized, 'translation')) {
    loadedLanguages.add(normalized);
    return normalized;
  }

  const { lng: resolvedLng, resource } = await loadLanguageBundle(normalized);
  if (!i18n.hasResourceBundle(resolvedLng, 'translation')) {
    i18n.addResourceBundle(resolvedLng, 'translation', resource.translation, true, true);
  }
  loadedLanguages.add(resolvedLng);
  return resolvedLng;
}

export async function changeAppLanguage(lng: string): Promise<SupportedLanguage> {
  const nextLng = await ensureLanguageLoaded(lng);
  await i18n.changeLanguage(nextLng);
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(languageStorageKey, nextLng);
  }
  return nextLng;
}
