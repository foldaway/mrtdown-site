import { PRIMARY_LOCALE } from '~/constants';

export function buildLocaleAwareLink(path: string, lang?: string) {
  if (lang == null || lang === PRIMARY_LOCALE) {
    return path;
  }
  return `/${lang}${path}`;
}
