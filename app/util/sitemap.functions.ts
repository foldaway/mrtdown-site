import { createServerFn } from '@tanstack/react-start';
import { DateTime, Interval } from 'luxon';
import type { Element, Root } from 'xast';
import { toXml } from 'xast-util-to-xml';
import { LANGUAGES_NON_DEFAULT } from '~/constants';
import { buildLocaleAwareLink } from '~/helpers/buildLocaleAwareLink';
import { getSitemapData } from './db.queries';

function buildEntries(path: string, rootUrl: string): Element {
  return {
    type: 'element',
    name: 'url',
    attributes: {},
    children: [
      {
        type: 'element',
        name: 'loc',
        attributes: {},
        children: [{ type: 'text', value: new URL(path, rootUrl).toString() }],
      },
      {
        type: 'element',
        name: 'lastmod',
        attributes: {},
        children: [{ type: 'text', value: __APP_BUILD_TIMESTAMP__ }],
      },
      {
        type: 'element',
        name: 'changefreq',
        attributes: {},
        children: [{ type: 'text', value: 'hourly' }],
      },
      {
        type: 'element',
        name: 'priority',
        attributes: {},
        children: [{ type: 'text', value: '0.7' }],
      },
      ...LANGUAGES_NON_DEFAULT.map((lang) => {
        return {
          type: 'element' as const,
          name: 'xhtml:link',
          attributes: {
            rel: 'alternate',
            hreflang: lang,
            href: new URL(buildLocaleAwareLink(path, lang), rootUrl).toString(),
          },
          children: [],
        } satisfies Element;
      }),
    ],
  };
}

export const getSitemapFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    const { lineIds, stationIds, operatorIds, issueIds, monthEarliest, monthLatest } =
      await getSitemapData();
    const paths: string[] = [
      '/',
      '/history',
      '/statistics',
      '/system-map',
      '/about',
    ];

    for (const lineId of lineIds) {
      paths.push(`/lines/${lineId}`);
    }
    for (const stationId of stationIds) {
      paths.push(`/stations/${stationId}`);
    }
    for (const operatorId of operatorIds) {
      paths.push(`/operators/${operatorId}`);
    }
    for (const issueId of issueIds) {
      paths.push(`/issues/${issueId}`);
    }

    const monthEarliestDateTime = DateTime.fromISO(monthEarliest);
    const monthLatestDateTime = DateTime.fromISO(monthLatest);
    const interval = Interval.fromDateTimes(
      monthEarliestDateTime,
      monthLatestDateTime.plus({ month: 1 }),
    );
    for (const monthInterval of interval.splitBy({ month: 1 })) {
      const monthDateTime = monthInterval.start;
      if (monthDateTime == null) {
        continue;
      }

      if (!paths.includes(`/history/${monthDateTime.toFormat('yyyy')}`)) {
        paths.push(`/history/${monthDateTime.toFormat('yyyy')}`);
      }

      paths.push(
        `/history/${monthDateTime.toFormat('yyyy')}/${monthDateTime.toFormat('MM')}`,
      );
    }

    const elementUrlSet: Element = {
      type: 'element',
      name: 'urlset',
      attributes: {
        xmlns: 'http://www.sitemaps.org/schemas/sitemap/0.9',
        'xmlns:xhtml': 'http://www.w3.org/1999/xhtml',
      },
      children: paths.map((path) => {
        return buildEntries(
          path,
          process.env.ROOT_URL ?? 'http://localhost:3000',
        );
      }),
    };

    const root: Root = {
      type: 'root',
      children: [elementUrlSet],
    };

    return toXml(root);
  },
);
