import { describe, expect, it } from 'vitest';
import { getCanonicalStationPath } from './getCanonicalStationPath';

describe('getCanonicalStationPath', () => {
  it('does not redirect canonical station ids', () => {
    expect(
      getCanonicalStationPath({
        requestedStationId: 'TAM',
        resolvedStationId: 'TAM',
      }),
    ).toBeNull();
  });

  it('redirects station-code aliases to the canonical station id', () => {
    expect(
      getCanonicalStationPath({
        requestedStationId: 'EW2',
        resolvedStationId: 'TAM',
      }),
    ).toBe('/stations/TAM');
  });

  it('preserves non-default locales in canonical station paths', () => {
    expect(
      getCanonicalStationPath({
        lang: 'zh-Hans',
        requestedStationId: 'EW2',
        resolvedStationId: 'TAM',
      }),
    ).toBe('/zh-Hans/stations/TAM');
  });
});
