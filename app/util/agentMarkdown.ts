import { DateTime } from 'luxon';
import { gfmToMarkdown } from 'mdast-util-gfm';
import { toMarkdown } from 'mdast-util-to-markdown';
import type { Root, RootContent, Table, TableCell, TableRow } from 'mdast';

export const PUBLIC_MARKDOWN_CACHE_CONTROL =
  'public, max-age=0, s-maxage=60, stale-while-revalidate=300';

export const MARKDOWN_CONTENT_TYPE = 'text/markdown; charset=utf-8';

const DEFAULT_MARKDOWN_TIMEZONE = 'Asia/Singapore';
const PUBLIC_HTML_CONTENT_TYPE = 'text/html';
const CANONICAL_MARKDOWN_PATH_PATTERNS = [
  /^\/index\.md$/,
  /^\/llms\.txt$/,
  /^\/issues\/[^/]+\/index\.md$/,
  /^\/lines\/[^/]+\/index\.md$/,
  /^\/operators\/[^/]+\/index\.md$/,
  /^\/stations\/[^/]+\/index\.md$/,
];
const PUBLIC_HTML_ROUTE_PREFIXES = [
  '/community-reports/',
  '/history/',
  '/lines/',
  '/operators/',
  '/stations/',
];
const PUBLIC_HTML_ROUTES = new Set([
  '/',
  '/about',
  '/history',
  '/statistics',
  '/system-map',
]);
const LOCALE_SEGMENTS = new Set(['en-SG', 'zh-Hans', 'ms', 'ta']);

type MarkdownDateInput = Date | DateTime | string;

interface MarkdownTableOptions {
  headers: string[];
  rows: string[][];
}

interface MarkdownDateOptions {
  zone?: string;
}

export function serializeAgentMarkdown(markdown: Root | RootContent[]) {
  const root = Array.isArray(markdown)
    ? ({
        type: 'root',
        children: markdown,
      } satisfies Root)
    : markdown;

  return toMarkdown(root, {
    bullet: '-',
    emphasis: '_',
    extensions: [gfmToMarkdown()],
    fences: true,
  });
}

export function markdownTable({ headers, rows }: MarkdownTableOptions) {
  if (headers.length === 0) {
    return null;
  }

  return {
    type: 'table',
    align: headers.map(() => null),
    children: [
      tableRow(headers),
      ...rows.map((row) => tableRow(normalizeTableRow(row, headers.length))),
    ],
  } satisfies Table;
}

export function formatMarkdownDate(
  value: MarkdownDateInput,
  options?: MarkdownDateOptions,
) {
  return parseMarkdownDate(value, options).toISODate();
}

export function formatMarkdownDateTime(
  value: MarkdownDateInput,
  options?: MarkdownDateOptions,
) {
  const isoDateTime = parseMarkdownDate(value, options).toISO({
    suppressMilliseconds: true,
  });

  if (isoDateTime == null) {
    throw new Error('Invalid Markdown date value');
  }

  return isoDateTime;
}

export function formatMarkdownDurationSeconds(totalSeconds: number) {
  if (!Number.isFinite(totalSeconds)) {
    throw new Error(`Invalid duration seconds: ${totalSeconds}`);
  }

  const sign = totalSeconds < 0 ? '-' : '';
  let remainingSeconds = Math.round(Math.abs(totalSeconds));
  const units = [
    ['d', 24 * 60 * 60],
    ['h', 60 * 60],
    ['m', 60],
    ['s', 1],
  ] as const;

  const parts: string[] = [];
  for (const [unit, secondsPerUnit] of units) {
    const amount = Math.floor(remainingSeconds / secondsPerUnit);
    if (amount === 0) {
      continue;
    }

    parts.push(`${amount}${unit}`);
    remainingSeconds -= amount * secondsPerUnit;
  }

  return `${sign}${parts.join(' ') || '0s'}`;
}

export function createPublicMarkdownResponse(
  body: BodyInit | null,
  init?: ResponseInit,
) {
  const headers = new Headers(init?.headers);
  const status = init?.status ?? 200;

  if (!headers.has('content-type')) {
    headers.set('content-type', MARKDOWN_CONTENT_TYPE);
  }

  if (status >= 200 && status < 300 && !headers.has('cache-control')) {
    headers.set('cache-control', PUBLIC_MARKDOWN_CACHE_CONTROL);
    headers.set('x-mrtdown-cache', 'public-markdown');
  }

  return new Response(body, {
    ...init,
    headers,
  });
}

export function getUnsupportedAgentMarkdownResponse(request: Request) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return null;
  }

  const pathname = new URL(request.url).pathname;
  if (isCanonicalAgentMarkdownPath(pathname)) {
    return null;
  }

  if (pathname.endsWith('.md')) {
    return new Response('Markdown route not found', {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  if (
    isPublicHtmlPath(pathname) &&
    prefersMarkdown(request.headers.get('accept'))
  ) {
    return new Response('Markdown is not available for this route', {
      status: 406,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  return null;
}

function isPublicHtmlPath(pathname: string) {
  const [firstSegment = '', ...rest] = pathname.split('/').filter(Boolean);
  const publicPath = LOCALE_SEGMENTS.has(firstSegment)
    ? rest.length > 0
      ? `/${rest.join('/')}`
      : '/'
    : pathname;

  return (
    PUBLIC_HTML_ROUTES.has(publicPath) ||
    PUBLIC_HTML_ROUTE_PREFIXES.some((prefix) => publicPath.startsWith(prefix))
  );
}

function tableRow(cells: string[]): TableRow {
  return {
    type: 'tableRow',
    children: cells.map(tableCell),
  };
}

function tableCell(value: string): TableCell {
  return {
    type: 'tableCell',
    children: [{ type: 'text', value }],
  };
}

function normalizeTableRow(row: string[], cellCount: number) {
  return Array.from({ length: cellCount }, (_, index) => row[index] ?? '');
}

function parseMarkdownDate(
  value: MarkdownDateInput,
  options?: MarkdownDateOptions,
) {
  const zone = options?.zone ?? DEFAULT_MARKDOWN_TIMEZONE;
  let dateTime: DateTime;

  if (DateTime.isDateTime(value)) {
    dateTime = value;
  } else if (value instanceof Date) {
    dateTime = DateTime.fromJSDate(value);
  } else {
    dateTime = DateTime.fromISO(value, { setZone: true });

    if (!dateTime.isValid) {
      dateTime = DateTime.fromSQL(value, { setZone: true });
    }
  }

  if (!dateTime.isValid) {
    throw new Error(`Invalid Markdown date value: ${value}`);
  }

  return dateTime.setZone(zone);
}

function isCanonicalAgentMarkdownPath(pathname: string) {
  return CANONICAL_MARKDOWN_PATH_PATTERNS.some((pattern) =>
    pattern.test(pathname),
  );
}

function prefersMarkdown(acceptHeader: string | null) {
  if (acceptHeader == null || acceptHeader === '') {
    return false;
  }

  const markdownQuality = getAcceptedQuality(acceptHeader, 'text/markdown');
  if (markdownQuality <= 0) {
    return false;
  }

  const htmlQuality = getAcceptedQuality(
    acceptHeader,
    PUBLIC_HTML_CONTENT_TYPE,
  );
  return markdownQuality > htmlQuality;
}

function getAcceptedQuality(acceptHeader: string, contentType: string) {
  const [targetType, targetSubtype] = contentType.toLowerCase().split('/');
  let specificity = -1;
  let quality = 0;

  for (const rawEntry of acceptHeader.split(',')) {
    const [rawMediaRange = '', ...rawParameters] = rawEntry
      .trim()
      .toLowerCase()
      .split(';');
    const [rangeType, rangeSubtype] = rawMediaRange.trim().split('/');
    if (
      (rangeType !== targetType && rangeType !== '*') ||
      (rangeSubtype !== targetSubtype && rangeSubtype !== '*')
    ) {
      continue;
    }

    const qParameter = rawParameters
      .map((parameter) => parameter.trim())
      .find((parameter) => parameter.startsWith('q='));
    const parsedQuality =
      qParameter == null ? 1 : Number.parseFloat(qParameter.slice('q='.length));
    const rangeSpecificity =
      rangeType === targetType && rangeSubtype === targetSubtype
        ? 2
        : rangeType === targetType
          ? 1
          : 0;
    if (rangeSpecificity < specificity) {
      continue;
    }

    const normalizedQuality = Number.isFinite(parsedQuality)
      ? parsedQuality
      : 0;
    if (rangeSpecificity > specificity) {
      specificity = rangeSpecificity;
      quality = normalizedQuality;
      continue;
    }

    quality = Math.max(quality, normalizedQuality);
  }

  return quality;
}
