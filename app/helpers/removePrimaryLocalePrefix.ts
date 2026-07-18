import { PRIMARY_LOCALE } from '~/constants';

/**
 * Removes only the explicit primary-locale path segment from a request path.
 */
export function removePrimaryLocalePrefix(pathname: string) {
  const prefix = `/${PRIMARY_LOCALE}`;
  if (pathname === prefix) {
    return '/';
  }
  return pathname.startsWith(`${prefix}/`)
    ? pathname.slice(prefix.length)
    : pathname;
}
