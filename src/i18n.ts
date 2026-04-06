import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { deTranslation } from './locales/de';
import { enTranslation } from './locales/en';
import { frTranslation } from './locales/fr';
import { nbTranslation } from './locales/nb';
import { nlTranslation } from './locales/nl';
import { ruTranslation } from './locales/ru';
import { zhTranslation } from './locales/zh';

const savedLanguage = localStorage.getItem('psysonic_language') || 'en';

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: enTranslation },
      de: { translation: deTranslation },
      fr: { translation: frTranslation },
      nl: { translation: nlTranslation },
      zh: { translation: zhTranslation },
      nb: { translation: nbTranslation },
      ru: { translation: ruTranslation },
    },
    lng: savedLanguage,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
  });

i18n.on('languageChanged', lng => {
  localStorage.setItem('psysonic_language', lng);
});

export default i18n;
