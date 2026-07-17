import { DateTime, Interval } from 'luxon';
import type { Element, Root } from 'xast';
import { toXml } from 'xast-util-to-xml';
import { buildLocaleAlternates } from '~/helpers/seo';
import { getSitemapData } from './dbQueries/sitemap';
import {
  HISTORY_YEAR_BOUNDS,
  isHistoryYearInBounds,
} from './historyYearBounds';

interface SitemapPathData {
  lineIds: string[];
  stationIds: string[];
  townIds: string[];
  operatorIds: string[];
  issueIds: string[];
  monthEarliest: string;
  monthLatest: string;
  currentDate: string;
}

export class SitemapGenerationError extends Error {
  readonly stage: string;

  constructor(stage: string, cause: unknown) {
    super(getErrorMessage(cause), { cause });
    this.name = 'SitemapGenerationError';
    this.stage = stage;
  }
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function getErrorName(error: unknown) {
  if (error instanceof Error) {
    return error.name;
  }
  return typeof error;
}

function sanitizeHeaderValue(value: string) {
  return value.replace(/[\r\n]/g, ' ').slice(0, 180);
}

export function createSitemapErrorResponse(error: unknown, rootUrl: string) {
  const stage =
    error instanceof SitemapGenerationError ? error.stage : 'route_handler';
  const cause =
    error instanceof SitemapGenerationError && error.cause != null
      ? error.cause
      : error;

  const fallbackRoot: Root = {
    type: 'root',
    children: [
      {
        type: 'element',
        name: 'urlset',
        attributes: {
          xmlns: 'http://www.sitemaps.org/schemas/sitemap/0.9',
          'xmlns:xhtml': 'http://www.w3.org/1999/xhtml',
        },
        children: [buildEntries('/', rootUrl)],
      },
    ],
  };

  return new Response(toXml(fallbackRoot), {
    status: 200,
    headers: {
      'cache-control': 'no-store',
      'content-type': 'application/xml',
      'x-sitemap-status': 'fallback',
      'x-sitemap-error-stage': sanitizeHeaderValue(stage),
      'x-sitemap-error-name': sanitizeHeaderValue(getErrorName(cause)),
      'x-sitemap-error-message': sanitizeHeaderValue(getErrorMessage(cause)),
    },
  });
}

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
      ...buildLocaleAlternates(path, rootUrl).map((alternate) => {
        return {
          type: 'element' as const,
          name: 'xhtml:link',
          attributes: {
            rel: 'alternate',
            hreflang: alternate.hreflang,
            href: alternate.href,
          },
          children: [],
        } satisfies Element;
      }),
    ],
  };
}

export async function getSitemapXml() {
  const startedAt = performance.now();
  const rootUrl = import.meta.env.VITE_ROOT_URL ?? 'http://localhost:3000';
  let stage = 'load_sitemap_data';

  try {
    const sitemapData = await getSitemapData();
    stage = 'build_sitemap_paths';
    const paths = buildSitemapPaths(sitemapData);

    console.info('[SITEMAP] Generated sitemap', {
      durationMs: Math.round(performance.now() - startedAt),
      rootUrl,
      pathCount: paths.length,
      lineCount: sitemapData.lineIds.length,
      stationCount: sitemapData.stationIds.length,
      operatorCount: sitemapData.operatorIds.length,
      issueCount: sitemapData.issueIds.length,
      historyPathCount: paths.filter((path) => path.startsWith('/history/'))
        .length,
      monthEarliest: sitemapData.monthEarliest,
      monthLatest: sitemapData.monthLatest,
      currentDate: sitemapData.currentDate,
    });

    stage = 'build_xml_entries';
    const elementUrlSet: Element = {
      type: 'element',
      name: 'urlset',
      attributes: {
        xmlns: 'http://www.sitemaps.org/schemas/sitemap/0.9',
        'xmlns:xhtml': 'http://www.w3.org/1999/xhtml',
      },
      children: paths.map((path) => {
        return buildEntries(path, rootUrl);
      }),
    };

    const root: Root = {
      type: 'root',
      children: [elementUrlSet],
    };

    stage = 'serialize_xml';
    return toXml(root);
  } catch (error) {
    console.error('[SITEMAP] Failed to generate sitemap', { error, stage });
    throw new SitemapGenerationError(stage, error);
  }
}

export function buildSitemapPaths({
  lineIds,
  stationIds,
  townIds,
  operatorIds,
  issueIds,
  monthEarliest,
  monthLatest,
  currentDate,
}: SitemapPathData) {
  const paths: string[] = [
    '/',
    '/lines',
    '/stations',
    '/statistics',
    '/system-map',
    '/towns',
    '/about',
  ];

  for (const lineId of lineIds) {
    paths.push(`/lines/${lineId}`);
  }
  for (const stationId of stationIds) {
    paths.push(`/stations/${stationId}`);
  }
  for (const townId of townIds) {
    paths.push(`/towns/${townId}`);
  }
  for (const operatorId of operatorIds) {
    paths.push(`/operators/${operatorId}`);
  }
  for (const issueId of issueIds) {
    paths.push(`/issues/${issueId}`);
  }

  const monthEarliestDateTime = DateTime.fromISO(monthEarliest);
  const monthLatestDateTime = DateTime.fromISO(monthLatest);
  const currentDateTime = DateTime.fromISO(currentDate);
  if (
    !monthEarliestDateTime.isValid ||
    !monthLatestDateTime.isValid ||
    !currentDateTime.isValid
  ) {
    console.warn('[SITEMAP] Skipping history paths with invalid date bounds', {
      monthEarliest,
      monthLatest,
      currentDate,
    });
    return paths;
  }

  const interval = Interval.fromDateTimes(
    monthEarliestDateTime,
    monthLatestDateTime.plus({ month: 1 }),
  );
  if (!interval.isValid) {
    console.warn('[SITEMAP] Skipping history paths with invalid month range', {
      monthEarliest,
      monthLatest,
      invalidReason: interval.invalidReason,
    });
    return paths;
  }

  for (const monthInterval of interval.splitBy({ month: 1 })) {
    const monthDateTime = monthInterval.start;
    if (monthDateTime == null) {
      continue;
    }

    if (
      !isHistoryYearInBounds(
        monthDateTime.year,
        HISTORY_YEAR_BOUNDS,
        currentDateTime,
      )
    ) {
      continue;
    }

    const yearPath = `/history/${monthDateTime.toFormat('yyyy')}`;
    if (!paths.includes(yearPath)) {
      paths.push(yearPath);
    }
    paths.push(
      `/history/${monthDateTime.toFormat('yyyy')}/${monthDateTime.toFormat('MM')}`,
    );
  }

  return paths;
}
