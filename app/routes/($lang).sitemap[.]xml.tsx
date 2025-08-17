import { DateTime, Interval } from 'luxon';
import type { Root, Element } from 'xast';
import { toXml } from 'xast-util-to-xml';
import { getIssues, getLines, getStations } from '~/client';
import { LANGUAGES_NON_DEFAULT } from '~/constants';
import { buildLocaleAwareLink } from '~/helpers/buildLocaleAwareLink';
import { assert } from '~/util/assert';

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

export async function loader() {
  const paths: string[] = [
    '/',
    '/history',
    '/statistics',
    '/system-map',
    '/about',
  ];

  // Lines
  {
    const { data, error, response } = await getLines({
      auth: () => process.env.API_TOKEN,
      baseUrl: process.env.API_ENDPOINT,
    });
    if (error != null) {
      console.error('Error fetching lines:', error);
      throw new Response('Failed to fetch lines', {
        status: response.status,
        statusText: response.statusText,
      });
    }
    assert(data != null);
    for (const lineId of data.data.lineIds) {
      paths.push(`/lines/${lineId}`);
    }
  }

  // Stations
  {
    const { data, error ,response } = await getStations({
      auth: () => process.env.API_TOKEN,
      baseUrl: process.env.API_ENDPOINT,
    });
    if (error != null) {
      console.error('Error fetching stations:', error);
      throw new Response('Failed to fetch stations', {
        status: response.status,
        statusText: response.statusText,
      });
    }
    assert(data != null);
    for (const stationId of data.data.stationIds) {
      paths.push(`/stations/${stationId}`);
    }
  }

  // Issue pages
  {
    const { data, error, response } = await getIssues({
      auth: () => process.env.API_TOKEN,
      baseUrl: process.env.API_ENDPOINT,
    });
    if (error != null) {
      console.error('Error fetching issues:', error);
      throw new Response('Failed to fetch issues', {
        status: response.status,
        statusText: response.statusText,
      });
    }
    assert(data != null);
    for (const issueId of data.data.issueIds) {
      paths.push(`/issues/${issueId}`);
    }

    const monthEarliestDateTime = DateTime.fromISO(data.data.monthEarliest)
    const monthLatestDateTime = DateTime.fromISO(data.data.monthLatest)

    const interval = Interval.fromDateTimes(monthEarliestDateTime, monthLatestDateTime)
    for (const monthInterval of interval.splitBy({ month: 1})) {
      const monthDateTime = monthInterval.start;
      assert(monthDateTime != null);

      if (!paths.includes(`/history/${monthDateTime.toFormat('yyyy')}`)) {
        paths.push(`/history/${monthDateTime.toFormat('yyyy')}`);
      }

      paths.push(`/history/${monthDateTime.toFormat('yyyy')}/${monthDateTime.toFormat('MM')}`);
    }
  }

  const elementUrlSet: Element = {
    type: 'element',
    name: 'urlset',
    attributes: {
      xmlns: 'http://www.sitemaps.org/schemas/sitemap/0.9',
      'xmlns:xhtml': 'http://www.w3.org/1999/xhtml',
    },
    children: paths.map((path) => {
      return buildEntries(path, process.env.ROOT_URL ?? 'http://localhost:3000');
    }),
  };

  const root: Root = {
    type: 'root',
    children: [elementUrlSet],
  };

  return new Response(toXml(root), {
    headers: {
      'content-type': 'application/xml',
    },
  });
}
