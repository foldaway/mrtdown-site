import type { Translations } from '@mrtdown/core';

type TranslationLocale = keyof Translations;

function normalizeTranslationLocale(
  locale: string | null | undefined,
): TranslationLocale {
  switch (locale) {
    case 'zh-Hans':
    case 'ms':
    case 'ta':
      return locale;
    default:
      return 'en-SG';
  }
}

export function getLocalizedTranslation(
  translations: Translations,
  locale: string | null | undefined,
) {
  return (
    translations[normalizeTranslationLocale(locale)] ?? translations['en-SG']
  );
}
