import { DateTime } from 'luxon';
import type { RootContent } from 'mdast';
import { describe, expect, it } from 'vitest';
import {
  createPublicMarkdownResponse,
  formatMarkdownDate,
  formatMarkdownDateTime,
  formatMarkdownDurationSeconds,
  markdownTable,
  serializeAgentMarkdown,
} from './agentMarkdown';

describe('agent Markdown serialization', () => {
  it('serializes headings, paragraphs, links, and lists with mdast escaping', () => {
    expect(
      serializeAgentMarkdown(
        mdast([
          {
            type: 'heading',
            depth: 1,
            children: [{ type: 'text', value: 'MRT_Down <status>' }],
          },
          {
            type: 'paragraph',
            children: [
              { type: 'text', value: 'See ' },
              {
                type: 'link',
                url: 'https://example.com/lines/(EWL)?q=a b',
                children: [{ type: 'text', value: 'Line (EWL)' }],
              },
            ],
          },
          {
            type: 'list',
            ordered: false,
            spread: false,
            children: [
              {
                type: 'listItem',
                spread: false,
                children: [
                  {
                    type: 'paragraph',
                    children: [{ type: 'text', value: 'alpha_beta *gamma*' }],
                  },
                ],
              },
              {
                type: 'listItem',
                spread: false,
                children: [
                  {
                    type: 'paragraph',
                    children: [
                      { type: 'text', value: 'Visit ' },
                      {
                        type: 'link',
                        url: '/stations/NS1',
                        children: [{ type: 'text', value: 'station [NS1]' }],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ]),
      ),
    ).toBe(
      [
        '# MRT\\_Down \\<status>',
        '',
        'See [Line (EWL)](<https://example.com/lines/(EWL)?q=a b>)',
        '',
        '- alpha\\_beta \\*gamma\\*',
        '- Visit [station \\[NS1\\]](/stations/NS1)',
        '',
      ].join('\n'),
    );
  });

  it('serializes GFM tables through mdast extensions', () => {
    const table = markdownTable({
      headers: ['Name | id', 'Status'],
      rows: [
        ['North_South <Line>', 'open | ok'],
        ['Broken\ncell', 'x'],
        ['Missing status'],
      ],
    });

    expect(table).not.toBeNull();
    expect(serializeAgentMarkdown(table == null ? [] : [table])).toBe(
      [
        '| Name \\| id           | Status     |',
        '| -------------------- | ---------- |',
        '| North\\_South \\<Line> | open \\| ok |',
        '| Broken&#xA;cell      | x          |',
        '| Missing status       |            |',
        '',
      ].join('\n'),
    );
  });

  it('formats dates, datetimes, and durations consistently for agent routes', () => {
    expect(formatMarkdownDate('2026-05-31T23:30:00+08:00')).toBe('2026-05-31');
    expect(formatMarkdownDateTime('2026-06-10 01:00:00+00')).toBe(
      '2026-06-10T09:00:00+08:00',
    );
    expect(
      formatMarkdownDateTime(
        DateTime.fromISO('2026-05-31T23:30:00+08:00', { setZone: true }),
      ),
    ).toBe('2026-05-31T23:30:00+08:00');
    expect(formatMarkdownDurationSeconds(90_061)).toBe('1d 1h 1m 1s');
    expect(formatMarkdownDurationSeconds(-60)).toBe('-1m');
    expect(formatMarkdownDurationSeconds(0)).toBe('0s');
  });
});

function mdast(nodes: RootContent[]) {
  return nodes;
}

describe('createPublicMarkdownResponse', () => {
  it('sets Markdown content type and public cache headers for successful responses', () => {
    const response = createPublicMarkdownResponse('# Status');

    expect(response.headers.get('content-type')).toBe(
      'text/markdown; charset=utf-8',
    );
    expect(response.headers.get('cache-control')).toBe(
      'public, max-age=0, s-maxage=60, stale-while-revalidate=300',
    );
    expect(response.headers.get('x-mrtdown-cache')).toBe('public-markdown');
  });

  it('preserves explicit headers and avoids public cache headers for errors', () => {
    const response = createPublicMarkdownResponse('Not found', {
      status: 404,
      headers: {
        'cache-control': 'no-store',
        'content-type': 'text/plain',
      },
    });

    expect(response.headers.get('content-type')).toBe('text/plain');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-mrtdown-cache')).toBeNull();
  });
});
