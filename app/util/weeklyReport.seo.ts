import { buildLocalizedAbsoluteUrl, type SeoHeadMetadata } from '~/helpers/seo';

type WeeklySeoInput = {
  seo: SeoHeadMetadata;
  title: string;
  description: string;
  locale: string;
  rootUrl: string;
  archiveTitle: string;
};

export function weeklySocialMeta(
  {
    seo,
    title,
    description,
  }: Pick<WeeklySeoInput, 'seo' | 'title' | 'description'>,
  article = false,
) {
  return [
    { title },
    { name: 'description', content: description },
    { property: 'og:title', content: title },
    { property: 'og:description', content: description },
    { property: 'og:type', content: article ? 'article' : 'website' },
    { property: 'og:url', content: seo.ogUrl },
    { property: 'og:image', content: seo.ogImage },
    { property: 'og:site_name', content: 'mrtdown' },
    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'twitter:title', content: title },
    { name: 'twitter:description', content: description },
    { name: 'twitter:image', content: seo.ogImage },
  ];
}

export function buildWeeklyJsonLd(
  input: WeeklySeoInput & {
    report?: { week: string; endDate: string; prose: string[] };
    weeks?: Array<{ url: string; title: string }>;
  },
) {
  const {
    seo,
    title,
    description,
    locale,
    rootUrl,
    archiveTitle,
    report,
    weeks,
  } = input;
  const archiveUrl = buildLocalizedAbsoluteUrl(
    '/reports/weekly',
    locale,
    rootUrl,
  );
  const organization = {
    '@type': 'Organization',
    '@id': new URL('/#organization', rootUrl).toString(),
    name: 'mrtdown',
    url: new URL('/', rootUrl).toString(),
  };
  const breadcrumbs = {
    '@type': 'BreadcrumbList',
    '@id': `${seo.canonicalUrl}#breadcrumbs`,
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: archiveTitle,
        item: archiveUrl,
      },
      ...(report
        ? [
            {
              '@type': 'ListItem',
              position: 2,
              name: title,
              item: seo.canonicalUrl,
            },
          ]
        : []),
    ],
  };
  const page = {
    '@type': report ? 'WebPage' : 'CollectionPage',
    '@id': `${seo.canonicalUrl}#webpage`,
    url: seo.canonicalUrl,
    name: title,
    description,
    inLanguage: locale,
    breadcrumb: { '@id': breadcrumbs['@id'] },
    mainEntity: {
      '@id': `${seo.canonicalUrl}${report ? '#article' : '#issues'}`,
    },
  };
  return {
    '@context': 'https://schema.org',
    '@graph': [
      organization,
      page,
      breadcrumbs,
      report
        ? {
            '@type': 'Article',
            '@id': `${seo.canonicalUrl}#article`,
            headline: title,
            description,
            inLanguage: locale,
            url: seo.canonicalUrl,
            mainEntityOfPage: { '@id': page['@id'] },
            image: seo.ogImage,
            author: { '@id': organization['@id'] },
            publisher: { '@id': organization['@id'] },
            isPartOf: {
              '@type': 'CollectionPage',
              '@id': `${archiveUrl}#webpage`,
              url: archiveUrl,
              name: archiveTitle,
            },
            temporalCoverage: `${report.week}/${report.endDate}`,
            articleBody: report.prose.join('\n\n'),
          }
        : {
            '@type': 'ItemList',
            '@id': `${seo.canonicalUrl}#issues`,
            numberOfItems: weeks?.length ?? 0,
            itemListElement: (weeks ?? []).map((week, index) => ({
              '@type': 'ListItem',
              position: index + 1,
              item: { '@type': 'Article', url: week.url, name: week.title },
            })),
          },
    ],
  };
}
