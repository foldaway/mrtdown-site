import { LOCALES } from '~/constants';

export function removeLocalePrefix(path: string) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const locale = LOCALES.find(
    (candidate) =>
      normalizedPath === `/${candidate}` ||
      normalizedPath.startsWith(`/${candidate}/`),
  );

  if (locale == null) {
    return normalizedPath;
  }

  const pathWithoutLocale = normalizedPath.slice(locale.length + 1);
  return pathWithoutLocale === '' ? '/' : pathWithoutLocale;
}
