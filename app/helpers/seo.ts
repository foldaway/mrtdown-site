import { LANGUAGES } from '~/constants';
import { buildLocaleAwareLink } from './buildLocaleAwareLink';

type SeoLanguage = (typeof LANGUAGES)[number];

const CANONICAL_LANG = 'en-SG';

export interface LocaleAlternate {
  href: string;
  hreflang: SeoLanguage | 'x-default';
}

export interface SeoHeadMetadata {
  canonicalUrl: string;
  links: Array<
    | {
        href: string;
        rel: 'canonical';
      }
    | {
        href: string;
        hrefLang: LocaleAlternate['hreflang'];
        rel: 'alternate';
      }
  >;
  ogImage: string;
  ogUrl: string;
}

export function buildSeoMetadata({
  path,
  rootUrl,
}: {
  path: string;
  rootUrl: string;
}): SeoHeadMetadata {
  const normalizedPath = normalizeSeoPath(path);
  const canonicalUrl = buildLocalizedAbsoluteUrl(
    normalizedPath,
    CANONICAL_LANG,
    rootUrl,
  );

  return {
    canonicalUrl,
    links: [
      {
        rel: 'canonical',
        href: canonicalUrl,
      },
      ...buildLocaleAlternates(normalizedPath, rootUrl).map((alternate) => {
        return {
          rel: 'alternate' as const,
          hrefLang: alternate.hreflang,
          href: alternate.href,
        };
      }),
    ],
    ogImage: new URL('/og_image.png', rootUrl).toString(),
    ogUrl: canonicalUrl,
  };
}

export function buildLocaleAlternates(
  path: string,
  rootUrl: string,
): LocaleAlternate[] {
  const normalizedPath = normalizeSeoPath(path);

  return [
    ...LANGUAGES.map((lang) => {
      return {
        hreflang: lang,
        href: buildLocalizedAbsoluteUrl(normalizedPath, lang, rootUrl),
      };
    }),
    {
      hreflang: 'x-default' as const,
      href: buildLocalizedAbsoluteUrl(normalizedPath, 'en-SG', rootUrl),
    },
  ];
}

export function buildLocalizedAbsoluteUrl(
  path: string,
  lang: string,
  rootUrl: string,
) {
  return new URL(
    buildLocaleAwareLink(normalizeSeoPath(path), lang),
    rootUrl,
  ).toString();
}

export function normalizeSeoPath(path: string) {
  const trimmedPath = path.trim();
  if (trimmedPath === '' || trimmedPath === '/') {
    return '/';
  }

  const prefixedPath = trimmedPath.startsWith('/')
    ? trimmedPath
    : `/${trimmedPath}`;

  return prefixedPath.endsWith('/') ? prefixedPath.slice(0, -1) : prefixedPath;
}
