import { DateTime } from 'luxon';
import { gfmToMarkdown } from 'mdast-util-gfm';
import { toMarkdown } from 'mdast-util-to-markdown';
import type { Root, RootContent, Table, TableCell, TableRow } from 'mdast';

export const PUBLIC_MARKDOWN_CACHE_CONTROL =
  'public, max-age=0, s-maxage=60, stale-while-revalidate=300';

export const MARKDOWN_CONTENT_TYPE = 'text/markdown; charset=utf-8';

const DEFAULT_MARKDOWN_TIMEZONE = 'Asia/Singapore';

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
