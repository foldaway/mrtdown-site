import { createServerFn } from '@tanstack/react-start';
import { DateTime, Interval } from 'luxon';
import type { Element, Root } from 'xast';
import { toXml } from 'xast-util-to-xml';
import { buildLocaleAlternates } from '~/helpers/seo';
import { getSitemapData } from './db.queries';

interface SitemapPathData {
  lineIds: string[];
  stationIds: string[];
  operatorIds: string[];
  issueIds: string[];
  monthEarliest: string;
  monthLatest: string;
  operationalFactCoverageDates: string[];
  operationalFactCoverageStartDate: string | null;
  operationalFactCoverageMissing?: boolean;
  currentDate: string;
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

export const getSitemapFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    const paths = buildSitemapPaths(await getSitemapData());

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
          import.meta.env.VITE_ROOT_URL ?? 'http://localhost:3000',
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

export function buildSitemapPaths({
  lineIds,
  stationIds,
  operatorIds,
  issueIds,
  monthEarliest,
  monthLatest,
  operationalFactCoverageDates,
  operationalFactCoverageMissing = false,
  operationalFactCoverageStartDate,
  currentDate,
}: SitemapPathData) {
  const paths: string[] = ['/', '/statistics', '/system-map', '/about'];

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
  const coverageDates = new Set(operationalFactCoverageDates);
  const coverageStartDateTime =
    operationalFactCoverageStartDate == null
      ? null
      : DateTime.fromISO(operationalFactCoverageStartDate);
  const currentDateTime = DateTime.fromISO(currentDate);
  const interval = Interval.fromDateTimes(
    monthEarliestDateTime,
    monthLatestDateTime.plus({ month: 1 }),
  );
  for (const monthInterval of interval.splitBy({ month: 1 })) {
    const monthDateTime = monthInterval.start;
    if (monthDateTime == null) {
      continue;
    }

    if (
      !isHistoryMonthRenderable({
        coverageDates,
        operationalFactCoverageMissing,
        coverageStartDateTime,
        currentDateTime,
        monthDateTime,
      })
    ) {
      continue;
    }

    const yearPath = `/history/${monthDateTime.toFormat('yyyy')}`;
    if (
      !paths.includes(yearPath) &&
      isHistoryYearRenderable({
        coverageDates,
        operationalFactCoverageMissing,
        coverageStartDateTime,
        currentDateTime,
        yearDateTime: monthDateTime.startOf('year'),
      })
    ) {
      paths.push(yearPath);
    }
    paths.push(
      `/history/${monthDateTime.toFormat('yyyy')}/${monthDateTime.toFormat('MM')}`,
    );
  }

  return paths;
}

function isHistoryMonthRenderable({
  coverageDates,
  operationalFactCoverageMissing,
  coverageStartDateTime,
  currentDateTime,
  monthDateTime,
}: {
  coverageDates: Set<string>;
  operationalFactCoverageMissing: boolean;
  coverageStartDateTime: DateTime | null;
  currentDateTime: DateTime;
  monthDateTime: DateTime;
}) {
  const monthStart = monthDateTime.startOf('month');
  const monthEnd = monthStart.endOf('month').startOf('day');

  return isHistoryDateRangeRenderable({
    coverageDates,
    operationalFactCoverageMissing,
    coverageStartDateTime,
    currentDateTime,
    rangeStart: monthStart,
    rangeEnd: monthEnd,
  });
}

function isHistoryYearRenderable({
  coverageDates,
  operationalFactCoverageMissing,
  coverageStartDateTime,
  currentDateTime,
  yearDateTime,
}: {
  coverageDates: Set<string>;
  operationalFactCoverageMissing: boolean;
  coverageStartDateTime: DateTime | null;
  currentDateTime: DateTime;
  yearDateTime: DateTime;
}) {
  const yearStart = yearDateTime.startOf('year');
  const yearEnd = yearStart.plus({ years: 1 }).minus({ days: 1 });

  return isHistoryDateRangeRenderable({
    coverageDates,
    operationalFactCoverageMissing,
    coverageStartDateTime,
    currentDateTime,
    rangeStart: yearStart,
    rangeEnd: yearEnd,
  });
}

function isHistoryDateRangeRenderable({
  coverageDates,
  operationalFactCoverageMissing,
  coverageStartDateTime,
  currentDateTime,
  rangeStart,
  rangeEnd,
}: {
  coverageDates: Set<string>;
  operationalFactCoverageMissing: boolean;
  coverageStartDateTime: DateTime | null;
  currentDateTime: DateTime;
  rangeStart: DateTime;
  rangeEnd: DateTime;
}) {
  const start = rangeStart.startOf('day');
  const end = rangeEnd.startOf('day');
  const today = currentDateTime.startOf('day');

  if (end >= today) {
    return true;
  }

  if (operationalFactCoverageMissing) {
    return true;
  }

  if (
    coverageStartDateTime != null &&
    start < coverageStartDateTime.startOf('day')
  ) {
    return true;
  }

  for (let cursor = start; cursor <= end; cursor = cursor.plus({ day: 1 })) {
    const date = cursor.toISODate();
    if (date == null || !coverageDates.has(date)) {
      return false;
    }
  }

  return true;
}
