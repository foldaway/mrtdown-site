import { describe, expect, it } from 'vitest';
import { buildLocaleAwareLink } from '~/helpers/buildLocaleAwareLink';
import { removeLocalePrefix } from './helpers';

describe('LocaleSwitcher helpers', () => {
  it('removes supported locale prefixes', () => {
    expect(removeLocalePrefix('/en-SG')).toBe('/');
    expect(removeLocalePrefix('/en-SG/history')).toBe('/history');
    expect(removeLocalePrefix('/zh-Hans/lines/BPLRT')).toBe('/lines/BPLRT');
    expect(removeLocalePrefix('/ms')).toBe('/');
  });

  it('keeps unprefixed paths unchanged', () => {
    expect(removeLocalePrefix('/')).toBe('/');
    expect(removeLocalePrefix('/history')).toBe('/history');
    expect(removeLocalePrefix('statistics')).toBe('/statistics');
  });

  it('builds default-locale footer links without en-SG in the path', () => {
    expect(
      buildLocaleAwareLink(removeLocalePrefix('/zh-Hans/history'), 'en-SG'),
    ).toBe('/history');
    expect(buildLocaleAwareLink(removeLocalePrefix('/history'), 'en-SG')).toBe(
      '/history',
    );
    expect(buildLocaleAwareLink(removeLocalePrefix('/ta'), 'en-SG')).toBe('/');
  });

  it('builds non-default locale footer links with locale prefixes', () => {
    expect(
      buildLocaleAwareLink(removeLocalePrefix('/en-SG/history'), 'zh-Hans'),
    ).toBe('/zh-Hans/history');
    expect(buildLocaleAwareLink(removeLocalePrefix('/'), 'ms')).toBe('/ms/');
  });
});
