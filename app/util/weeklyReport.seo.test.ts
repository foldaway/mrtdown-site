import { describe, expect, it } from 'vitest';
import { buildSeoMetadata } from '~/helpers/seo';
import { buildWeeklyJsonLd } from './weeklyReport.seo';

const rootUrl = 'https://www.mrtdown.org';
const input = {
  rootUrl,
  locale: 'ms',
  title: 'Laporan mingguan',
  description: 'Ringkasan',
  archiveTitle: 'Arkib',
  seo: buildSeoMetadata({
    rootUrl,
    lang: 'ms',
    path: '/reports/weekly/2026-09-28',
  }),
};

describe('weekly report structured data', () => {
  it('uses the localized canonical and visible prose without inventing publication or modification dates', () => {
    const data = buildWeeklyJsonLd({
      ...input,
      report: {
        week: '2026-09-28',
        endDate: '2026-10-04',
        prose: ['Summary.', 'Maintenance.'],
      },
    });
    const article = data['@graph'].find((node) => node['@type'] === 'Article');
    expect(article).toMatchObject({
      url: 'https://www.mrtdown.org/ms/reports/weekly/2026-09-28',
      inLanguage: 'ms',
      articleBody: 'Summary.\n\nMaintenance.',
      temporalCoverage: '2026-09-28/2026-10-04',
    });
    expect(article).not.toHaveProperty('datePublished');
    expect(article).not.toHaveProperty('dateModified');
    const breadcrumbs = data['@graph'].find(
      (node) => node['@type'] === 'BreadcrumbList',
    );
    expect(breadcrumbs).toMatchObject({
      itemListElement: [
        { position: 1, item: 'https://www.mrtdown.org/ms/reports/weekly' },
        { position: 2, item: input.seo.canonicalUrl },
      ],
    });
  });
  it('describes the archive as a collection of the visible issue links', () => {
    const data = buildWeeklyJsonLd({
      ...input,
      weeks: [{ url: input.seo.canonicalUrl, title: 'Week one' }],
    });
    expect(data['@graph']).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ '@type': 'CollectionPage' }),
        expect.objectContaining({
          '@type': 'ItemList',
          numberOfItems: 1,
          itemListElement: [
            expect.objectContaining({
              position: 1,
              item: expect.objectContaining({
                url: input.seo.canonicalUrl,
                name: 'Week one',
              }),
            }),
          ],
        }),
      ]),
    );
  });
});
