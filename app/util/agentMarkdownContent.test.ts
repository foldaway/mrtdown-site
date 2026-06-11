import { describe, expect, it } from 'vitest';
import { getIssueMarkdown, getOverviewMarkdown } from './agentMarkdownContent';

describe('agent Markdown content builders', () => {
  it('renders overview Markdown from read-model data', () => {
    const markdown = getOverviewMarkdown(
      {
        data: {
          issueIdsActiveNow: ['issue-1'],
          issueIdsActiveToday: [],
          lineSummaries: [
            {
              lineId: 'EWL',
              status: 'ongoing_disruption',
              uptimeRatio: 0.995,
              totalDowntimeSeconds: 300,
            },
          ],
          communitySignals: [
            {
              id: 'signal-1',
              effect: 'delay',
              reportCount: 2,
              lineIds: ['EWL'],
              stationIds: ['EW1'],
              windowStartAt: '2026-06-11T08:00:00+08:00',
              windowEndAt: '2026-06-11T09:00:00+08:00',
              updatedAt: '2026-06-11T09:00:00+08:00',
            },
          ],
        },
        included: {
          lines: {
            EWL: {
              id: 'EWL',
              name: translations('East West Line'),
            },
          },
          stations: {
            EW1: {
              id: 'EW1',
              name: translations('Pasir Ris'),
            },
          },
          issues: {
            'issue-1': {
              id: 'issue-1',
              title: translations('Train fault near Pasir Ris'),
              type: 'disruption',
              durationSeconds: 300,
              lineIds: ['EWL'],
              branchesAffected: [],
              intervals: [],
              subtypes: [],
            },
          },
          landmarks: {},
          towns: {},
          operators: {},
        },
      } as unknown as Parameters<typeof getOverviewMarkdown>[0],
      { rootUrl: 'https://example.com' },
    );

    expect(markdown).toContain('# Singapore MRT & LRT Service Status');
    expect(markdown).toContain(
      '[Train fault near Pasir Ris](https://example.com/issues/issue-1/index.md)',
    );
    expect(markdown).toContain('East West Line');
    expect(markdown).toContain('99.5%');
    expect(markdown).toContain('5m');
    expect(markdown).toContain('/lines/EWL/index.md');
    expect(markdown).toContain('## Community Reports');
    expect(markdown).toContain('Delay');
    expect(markdown).toContain('Pasir Ris (EW1)');
  });

  it('renders issue Markdown with affected network, intervals, and updates', () => {
    const markdown = getIssueMarkdown(
      {
        data: {
          id: 'issue-1',
          updates: [
            {
              type: 'statement.official',
              text: 'Operator update with *markdown-sensitive* text.',
              textTranslations: null,
              sourceUrl: 'https://example.com/source',
              createdAt: '2026-06-11T09:15:00+08:00',
            },
          ],
        },
        included: {
          lines: {
            EWL: {
              id: 'EWL',
              name: translations('East West Line'),
            },
          },
          stations: {
            EW1: {
              id: 'EW1',
              name: translations('Pasir Ris'),
            },
            EW2: {
              id: 'EW2',
              name: translations('Tampines'),
            },
          },
          issues: {
            'issue-1': {
              id: 'issue-1',
              title: translations('Train fault near Pasir Ris'),
              type: 'disruption',
              durationSeconds: 1800,
              lineIds: ['EWL'],
              branchesAffected: [
                {
                  lineId: 'EWL',
                  branchId: 'ewl-main',
                  stationIds: ['EW1', 'EW2'],
                },
              ],
              intervals: [
                {
                  status: 'ended',
                  startAt: '2026-06-11T08:45:00+08:00',
                  endAt: '2026-06-11T09:15:00+08:00',
                },
              ],
              subtypes: ['train.fault'],
            },
          },
          landmarks: {},
          towns: {},
          operators: {},
        },
      } as unknown as Parameters<typeof getIssueMarkdown>[0],
      { rootUrl: 'https://example.com' },
    );

    expect(markdown).toContain('# Train fault near Pasir Ris');
    expect(markdown).toContain(
      'Disruption issue affecting East West Line (EWL).',
    );
    expect(markdown).toContain('Duration: 30m');
    expect(markdown).toContain('Pasir Ris (EW1), Tampines (EW2)');
    expect(markdown).toContain('2026-06-11T08:45:00+08:00');
    expect(markdown).toContain(
      'Operator update with \\*markdown-sensitive\\* text.',
    );
    expect(markdown).toContain('<https://example.com/source>');
  });
});

function translations(value: string) {
  return {
    'en-SG': value,
    'zh-Hans': null,
    ms: null,
    ta: null,
  };
}
