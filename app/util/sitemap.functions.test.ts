import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { buildSitemapPaths } from './sitemap.functions';

vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => ({
    handler: (handler: unknown) => handler,
  }),
}));

vi.mock('./db.queries', () => ({
  getSitemapData: vi.fn(),
}));

describe('agent Markdown discovery', () => {
  it('keeps robots.txt limited to standard discovery directives', () => {
    const robotsTxt = readFileSync(
      new URL('../../public/robots.txt', import.meta.url),
      'utf8',
    );

    const directives = robotsTxt
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line !== '' && !line.startsWith('#'))
      .map((line) => line.split(':', 1)[0]?.toLowerCase());

    expect(directives).toEqual(['user-agent', 'disallow', 'sitemap']);
    expect(robotsTxt).toContain('Sitemap: https://www.mrtdown.org/sitemap.xml');
    expect(robotsTxt).not.toMatch(/^LLMS:/im);
  });

  it('keeps Markdown routes discoverable through llms.txt instead of the XML sitemap', () => {
    const paths = buildSitemapPaths({
      lineIds: ['EWL'],
      stationIds: ['EW1'],
      operatorIds: ['SMRT'],
      issueIds: ['issue-1'],
      monthEarliest: '2026-04-01',
      monthLatest: '2026-05-01',
      operationalFactCoverageDates: [
        ...buildCoverageDates('2026-04'),
        ...buildCoverageDates('2026-05'),
      ],
      operationalFactCoverageStartDate: '2026-04-01',
      currentDate: '2026-06-21',
    });

    expect(paths).toEqual(
      expect.arrayContaining([
        '/',
        '/lines/EWL',
        '/stations/EW1',
        '/operators/SMRT',
        '/issues/issue-1',
        '/history/2026/04',
        '/history/2026/05',
      ]),
    );
    expect(paths).not.toContain('/llms.txt');
    expect(paths).not.toContain('/index.md');
    expect(paths).not.toContain('/lines/EWL/index.md');
    expect(paths).not.toContain('/stations/EW1/index.md');
    expect(paths).not.toContain('/operators/SMRT/index.md');
    expect(paths).not.toContain('/issues/issue-1/index.md');
    expect(paths.every((path) => !path.endsWith('.md'))).toBe(true);
  });

  it('excludes redirect-only history paths from the XML sitemap', () => {
    const paths = buildSitemapPaths({
      lineIds: [],
      stationIds: [],
      operatorIds: [],
      issueIds: [],
      monthEarliest: '2026-06-01',
      monthLatest: '2026-06-01',
      operationalFactCoverageDates: [],
      operationalFactCoverageStartDate: null,
      currentDate: '2026-06-21',
    });

    expect(paths).not.toContain('/history');
  });

  it('skips historical months that cannot render from facts or legacy fallback', () => {
    const paths = buildSitemapPaths({
      lineIds: [],
      stationIds: [],
      operatorIds: [],
      issueIds: [],
      monthEarliest: '2026-04-01',
      monthLatest: '2026-06-01',
      operationalFactCoverageDates: buildCoverageDates('2026-06'),
      operationalFactCoverageStartDate: '2026-05-01',
      currentDate: '2026-06-21',
    });

    expect(paths).toContain('/history/2026/04');
    expect(paths).not.toContain('/history/2026/05');
    expect(paths).toContain('/history/2026/06');
  });

  it('includes historical months when D1 fact tables are absent', () => {
    const paths = buildSitemapPaths({
      lineIds: [],
      stationIds: [],
      operatorIds: [],
      issueIds: [],
      monthEarliest: '2026-04-01',
      monthLatest: '2026-05-01',
      operationalFactCoverageDates: [],
      operationalFactCoverageMissing: true,
      operationalFactCoverageStartDate: null,
      currentDate: '2026-06-21',
    });

    expect(paths).toContain('/history/2026');
    expect(paths).toContain('/history/2026/04');
    expect(paths).toContain('/history/2026/05');
  });

  it('only includes history year paths when the full year can render', () => {
    const paths = buildSitemapPaths({
      lineIds: [],
      stationIds: [],
      operatorIds: [],
      issueIds: [],
      monthEarliest: '2025-01-01',
      monthLatest: '2025-01-01',
      operationalFactCoverageDates: buildCoverageDates('2025-01'),
      operationalFactCoverageStartDate: '2025-01-01',
      currentDate: '2026-06-21',
    });

    expect(paths).toContain('/history/2025/01');
    expect(paths).not.toContain('/history/2025');
  });

  it('keeps history sitemap URLs within route year bounds', () => {
    const paths = buildSitemapPaths({
      lineIds: [],
      stationIds: [],
      operatorIds: [],
      issueIds: [],
      monthEarliest: '2009-12-01',
      monthLatest: '2027-01-01',
      operationalFactCoverageDates: [
        ...buildCoverageDates('2009-12'),
        ...buildCoverageDates('2026-12'),
        ...buildCoverageDates('2027-01'),
      ],
      operationalFactCoverageStartDate: '2009-12-01',
      currentDate: '2026-06-21',
    });

    expect(paths).not.toContain('/history/2009/12');
    expect(paths).toContain('/history/2026/12');
    expect(paths).not.toContain('/history/2027/01');
  });

  it('keeps sitemap generation alive when history date bounds are invalid', () => {
    const paths = buildSitemapPaths({
      lineIds: ['EWL'],
      stationIds: ['EW1'],
      operatorIds: ['SMRT'],
      issueIds: ['issue-1'],
      monthEarliest: 'not-a-date',
      monthLatest: '2026-05-01',
      operationalFactCoverageDates: [],
      operationalFactCoverageStartDate: null,
      currentDate: '2026-06-21',
    });

    expect(paths).toEqual([
      '/',
      '/statistics',
      '/system-map',
      '/about',
      '/lines/EWL',
      '/stations/EW1',
      '/operators/SMRT',
      '/issues/issue-1',
    ]);
  });
});

function buildCoverageDates(month: string) {
  const [year, monthNumber] = month.split('-').map(Number);
  const dateCount = new Date(year, monthNumber, 0).getDate();

  return Array.from({ length: dateCount }, (_, index) => {
    const day = String(index + 1).padStart(2, '0');
    return `${month}-${day}`;
  });
}
