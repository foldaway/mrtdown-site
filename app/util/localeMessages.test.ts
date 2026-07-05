import { describe, expect, it } from 'vitest';
import { getLocaleMessages } from './localeMessages';

const localeFiles = ['en-SG', 'zh-Hans', 'ms', 'ta'] as const;

async function readLocaleMessages(locale: (typeof localeFiles)[number]) {
  return (await import(`../../lang/${locale}.json`)).default as Record<
    string,
    string
  >;
}

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

  it('keeps all translated locale catalogs in sync with English message IDs', async () => {
    const englishMessages = await readLocaleMessages('en-SG');
    const englishKeys = Object.keys(englishMessages).sort();

    await Promise.all(
      localeFiles
        .filter((locale) => locale !== 'en-SG')
        .map(async (locale) => {
          expect(Object.keys(await readLocaleMessages(locale)).sort()).toEqual(
            englishKeys,
          );
        }),
    );
  });
});
