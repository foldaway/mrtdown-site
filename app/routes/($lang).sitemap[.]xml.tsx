import { DateTime } from 'luxon';
import type { Root, Element } from 'xast';
import { toXml } from 'xast-util-to-xml';
import { LANGUAGES_NON_DEFAULT } from '~/constants';
import { buildLocaleAwareLink } from '~/helpers/buildLocaleAwareLink';
import type {
  ComponentIndex,
  IssueIndex,
  IssuesHistory,
  StationIndex,
} from '~/types';
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
        children: [{ type: 'text', value: DateTime.now().toISO() }],
      },
      {
        type: 'element',
        name: 'changefreq',
        attributes: {},
        children: [{ type: 'text', value: 'daily' }],
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
    const res = await fetch(
      'https://data.mrtdown.org/product/component_index.json',
    );
    assert(res.ok, res.statusText);
    const componentIndex: ComponentIndex = await res.json();
    for (const componentId of componentIndex) {
      paths.push(`/lines/${componentId}`);
      paths.push(`/status/${componentId}`);
    }
  }

  // Stations
  {
    const res = await fetch(
      'https://data.mrtdown.org/product/station_index.json',
    );
    assert(res.ok, res.statusText);
    const stationIndex: StationIndex = await res.json();

    for (const stationId of stationIndex) {
      paths.push(`/stations/${stationId}`);
    }
  }

  // History pages
  {
    const res = await fetch(
      'https://data.mrtdown.org/product/issues_history.json',
    );
    assert(res.ok, res.statusText);
    const history: IssuesHistory = await res.json();

    for (let i = 0; i < history.pageCount; i++) {
      paths.push(`/history/page/${i + 1}`);
    }
  }

  // Issue pages
  {
    const res = await fetch(
      'https://data.mrtdown.org/product/issue_index.json',
    );
    assert(res.ok, res.statusText);
    const issueIndex: IssueIndex = await res.json();

    for (const issueId of issueIndex) {
      paths.push(`/issues/${issueId}`);
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
