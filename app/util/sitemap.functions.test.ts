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
  it('advertises llms.txt through robots.txt', () => {
    const robotsTxt = readFileSync(
      new URL('../../public/robots.txt', import.meta.url),
      'utf8',
    );

    expect(robotsTxt).toContain('LLMS: https://www.mrtdown.org/llms.txt');
  });

  it('keeps Markdown routes discoverable through llms.txt instead of the XML sitemap', () => {
    const paths = buildSitemapPaths({
      lineIds: ['EWL'],
      stationIds: ['EW1'],
      operatorIds: ['SMRT'],
      issueIds: ['issue-1'],
      monthEarliest: '2026-04-01',
      monthLatest: '2026-05-01',
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
});
