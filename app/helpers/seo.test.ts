import { describe, expect, it } from 'vitest';
import {
  buildLocaleAlternates,
  buildLocalizedAbsoluteUrl,
  buildSeoMetadata,
  normalizeSeoPath,
} from './seo';

const ROOT_URL = 'https://www.mrtdown.org';

describe('SEO helpers', () => {
  it('normalizes route paths for canonical URLs', () => {
    expect(normalizeSeoPath('')).toBe('/');
    expect(normalizeSeoPath('/')).toBe('/');
    expect(normalizeSeoPath('statistics')).toBe('/statistics');
    expect(normalizeSeoPath('/statistics/')).toBe('/statistics');
  });

  it('builds localized absolute URLs from canonical route paths', () => {
    expect(buildLocalizedAbsoluteUrl('/', 'en-SG', ROOT_URL)).toBe(
      'https://www.mrtdown.org/',
    );
    expect(buildLocalizedAbsoluteUrl('/', 'zh-Hans', ROOT_URL)).toBe(
      'https://www.mrtdown.org/zh-Hans/',
    );
    expect(buildLocalizedAbsoluteUrl('/statistics/', 'ms', ROOT_URL)).toBe(
      'https://www.mrtdown.org/ms/statistics',
    );
  });

  it('builds full locale alternates with x-default', () => {
    expect(buildLocaleAlternates('/about', ROOT_URL)).toEqual([
      { hreflang: 'en-SG', href: 'https://www.mrtdown.org/about' },
      { hreflang: 'zh-Hans', href: 'https://www.mrtdown.org/zh-Hans/about' },
      { hreflang: 'ms', href: 'https://www.mrtdown.org/ms/about' },
      { hreflang: 'ta', href: 'https://www.mrtdown.org/ta/about' },
      { hreflang: 'x-default', href: 'https://www.mrtdown.org/about' },
    ]);
  });

  it('uses the en-SG URL for canonical and og:url', () => {
    const metadata = buildSeoMetadata({
      path: '/history/2026/',
      rootUrl: ROOT_URL,
    });

    expect(metadata.canonicalUrl).toBe('https://www.mrtdown.org/history/2026');
    expect(metadata.ogUrl).toBe(metadata.canonicalUrl);
    expect(metadata.ogImage).toBe('https://www.mrtdown.org/og_image.png');
    expect(metadata.links).toContainEqual({
      rel: 'canonical',
      href: metadata.canonicalUrl,
    });
    expect(metadata.links).toContainEqual({
      rel: 'alternate',
      hrefLang: 'x-default',
      href: 'https://www.mrtdown.org/history/2026',
    });
  });

  it('keeps locale alternates when canonicalizing to en-SG', () => {
    const metadata = buildSeoMetadata({
      path: '/lines/BPLRT/',
      rootUrl: ROOT_URL,
    });

    expect(metadata.canonicalUrl).toBe('https://www.mrtdown.org/lines/BPLRT');
    expect(metadata.ogUrl).toBe(metadata.canonicalUrl);
    expect(metadata.links).toContainEqual({
      rel: 'canonical',
      href: 'https://www.mrtdown.org/lines/BPLRT',
    });
    expect(metadata.links).toContainEqual({
      rel: 'alternate',
      hrefLang: 'ta',
      href: 'https://www.mrtdown.org/ta/lines/BPLRT',
    });
  });
});
