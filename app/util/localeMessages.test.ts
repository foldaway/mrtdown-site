import { describe, expect, it } from 'vitest';
import { getLocaleMessages } from './localeMessages';

describe('getLocaleMessages', () => {
  it('returns messages for supported locales', async () => {
    await expect(getLocaleMessages('en-SG')).resolves.toMatchObject({
      'about.faq': 'Frequently Asked Questions',
    });
    expect((await getLocaleMessages('ms'))['about.faq']).toBeTruthy();
  });

  it('falls back to English messages for unknown locales', async () => {
    await expect(getLocaleMessages('unknown')).resolves.toMatchObject({
      'about.faq': (await getLocaleMessages('en-SG'))['about.faq'],
    });
  });

  it('reuses the promise for repeated locale requests', () => {
    expect(getLocaleMessages('en-SG')).toBe(getLocaleMessages('en-SG'));
    expect(getLocaleMessages('unknown')).toBe(getLocaleMessages('en-SG'));
  });
});
