type LocaleMessages = Record<string, string>;

const localeMessageImports: Record<string, () => Promise<LocaleMessages>> = {
  'en-SG': () =>
    import('../../lang/en-SG.json').then((module) => module.default),
  ms: () => import('../../lang/ms.json').then((module) => module.default),
  ta: () => import('../../lang/ta.json').then((module) => module.default),
  'zh-Hans': () =>
    import('../../lang/zh-Hans.json').then((module) => module.default),
};

const localeMessagePromises = new Map<string, Promise<LocaleMessages>>();

/**
 * Loads only the requested locale chunk and reuses the promise for later calls
 * in the same worker isolate.
 */
export function getLocaleMessages(lang: string) {
  const locale = localeMessageImports[lang] == null ? 'en-SG' : lang;
  const cached = localeMessagePromises.get(locale);
  if (cached != null) {
    return cached;
  }

  const messages = localeMessageImports[locale]();
  localeMessagePromises.set(locale, messages);
  return messages;
}
