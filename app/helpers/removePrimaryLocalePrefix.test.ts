import { describe, expect, it } from 'vitest';
import { removePrimaryLocalePrefix } from './removePrimaryLocalePrefix';

describe('removePrimaryLocalePrefix', () => {
  it('removes the explicit primary-locale prefix', () => {
    expect(removePrimaryLocalePrefix('/en-SG')).toBe('/');
    expect(removePrimaryLocalePrefix('/en-SG/about')).toBe('/about');
  });

  it('does not alter other paths', () => {
    expect(removePrimaryLocalePrefix('/zh-Hans/about')).toBe('/zh-Hans/about');
    expect(removePrimaryLocalePrefix('/en-SGish/about')).toBe(
      '/en-SGish/about',
    );
  });
});
