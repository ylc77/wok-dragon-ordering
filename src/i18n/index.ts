import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import {
  fallbackLanguages,
  getInitialLanguage,
  loadLanguageBundle,
  markLanguageLoaded,
  type SupportedLanguage,
} from './loadLanguage';

let initPromise: Promise<typeof i18n> | null = null;

export function initI18n() {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const initialLanguage = getInitialLanguage();
    const { lng, resource } = await loadInitialResource(initialLanguage);

    await i18n.use(initReactI18next).init({
      resources: {
        [lng]: resource,
      },
      lng,
      fallbackLng: fallbackLanguages,
      interpolation: { escapeValue: false },
    });
    markLanguageLoaded(lng);
    return i18n;
  })();

  return initPromise;
}

async function loadInitialResource(initialLanguage: SupportedLanguage) {
  try {
    return await loadLanguageBundle(initialLanguage);
  } catch {
    return loadLanguageBundle('el');
  }
}

export * from './loadLanguage';
export default i18n;
