import { describe, expect, it } from 'vitest';
import {
  getIssueMarkdown,
  getLineMarkdown,
  getOperatorMarkdown,
  getOverviewMarkdown,
  getStationMarkdown,
} from './agentMarkdownContent';

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

  it('renders line Markdown with facts, branches, interchanges, and community signals', () => {
    const markdown = getLineMarkdown(
      {
        data: {
          lineId: 'EWL',
          lineSummary: {
            status: 'ongoing_disruption',
            uptimeRatio: 0.998,
            totalDowntimeSeconds: 600,
          },
          branches: [
            {
              id: 'ewl-main',
              lineId: 'EWL',
              stationIds: ['EW1', 'EW2'],
            },
          ],
          issueIdNextMaintenance: 'issue-maintenance',
          issueIdsRecent: ['issue-disruption'],
          issueCountByType: { disruption: 1, maintenance: 1 },
          timeScaleGraphsIssueCount: [],
          timeScaleGraphsUptimeRatios: [],
          stationIdsInterchanges: ['EW2'],
          communitySignals: [
            {
              id: 'signal-1',
              effect: 'crowding',
              reportCount: 3,
              lineIds: ['EWL'],
              stationIds: ['EW2'],
              windowStartAt: '2026-06-11T10:00:00+08:00',
              windowEndAt: '2026-06-11T11:00:00+08:00',
              updatedAt: '2026-06-11T11:00:00+08:00',
            },
          ],
        },
        included: {
          lines: {
            EWL: {
              id: 'EWL',
              name: translations('East West Line'),
              startedAt: '1987-12-12',
              operators: [{ operatorId: 'SMRT' }],
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
            'issue-disruption': issue('issue-disruption', 'Train fault'),
            'issue-maintenance': issue(
              'issue-maintenance',
              'Track maintenance',
              'maintenance',
            ),
          },
          landmarks: {},
          towns: {},
          operators: {
            SMRT: {
              id: 'SMRT',
              name: translations('SMRT Trains'),
            },
          },
        },
      } as unknown as Parameters<typeof getLineMarkdown>[0],
      { rootUrl: 'https://example.com' },
    );

    expect(markdown).toContain('# East West Line (EWL)');
    expect(markdown).toContain('Current status: Disruption.');
    expect(markdown).toContain('Operators: SMRT Trains');
    expect(markdown).toContain('Recent uptime: 99.8%');
    expect(markdown).toContain('Recent downtime: 10m');
    expect(markdown).toContain(
      '[Track maintenance](https://example.com/issues/issue-maintenance/index.md)',
    );
    expect(markdown).toContain('| ewl-main | 2 stations |');
    expect(markdown).toContain(
      '[Tampines](https://example.com/stations/EW2/index.md)',
    );
    expect(markdown).toContain('Crowding');
  });

  it('renders station Markdown with served lines, area facts, and recent issues', () => {
    const markdown = getStationMarkdown(
      {
        data: {
          stationId: 'EW2',
          status: 'normal',
          issueIdsRecent: ['issue-1'],
          issueCountByType: { disruption: 1 },
          communitySignals: [],
        },
        included: {
          lines: {
            EWL: {
              id: 'EWL',
              name: translations('East West Line'),
            },
            DTL: {
              id: 'DTL',
              name: translations('Downtown Line'),
            },
          },
          stations: {
            EW2: {
              id: 'EW2',
              name: translations('Tampines'),
              townId: 'tampines',
              landmarkIds: ['mall'],
              memberships: [
                {
                  branchId: 'ewl-main',
                  code: 'EW2',
                  lineId: 'EWL',
                  sequenceOrder: 2,
                  startedAt: '1989-12-16',
                  structureType: 'elevated',
                },
                {
                  branchId: 'dtl-main',
                  code: 'DT32',
                  lineId: 'DTL',
                  sequenceOrder: 32,
                  startedAt: '2017-10-21',
                  structureType: 'underground',
                },
              ],
            },
          },
          issues: {
            'issue-1': issue('issue-1', 'Signal fault'),
          },
          landmarks: {
            mall: {
              id: 'mall',
              name: translations('Tampines Mall'),
            },
          },
          towns: {
            tampines: {
              id: 'tampines',
              name: translations('Tampines'),
            },
          },
          operators: {},
        },
      } as unknown as Parameters<typeof getStationMarkdown>[0],
      { rootUrl: 'https://example.com' },
    );

    expect(markdown).toContain('# Tampines Station (EW2)');
    expect(markdown).toContain('Current status: Operational.');
    expect(markdown).toContain('Town: Tampines');
    expect(markdown).toContain('Nearby landmarks: Tampines Mall');
    expect(markdown).toMatch(
      /\| EW2\s+\| EWL\s+\| East West Line\s+\| elevated\s+\| 1989-12-16 \|/,
    );
    expect(markdown).toMatch(
      /\| DT32 \| DTL\s+\| Downtown Line\s+\| underground \| 2017-10-21 \|/,
    );
    expect(markdown).toContain(
      '[Signal fault](https://example.com/issues/issue-1/index.md)',
    );
  });

  it('renders operator Markdown with line performance and affected lines', () => {
    const markdown = getOperatorMarkdown(
      {
        data: {
          operatorId: 'SMRT',
          lineIds: ['EWL', 'NSL'],
          aggregateUptimeRatio: 0.9975,
          currentOperationalStatus: 'some_lines_disrupted',
          linesAffected: ['EWL'],
          totalIssuesByType: { disruption: 2 },
          totalStationsOperated: 54,
          issueIdsRecent: ['issue-1'],
          timeScaleGraphsIssueCount: [],
          timeScaleGraphsUptimeRatios: [],
          linePerformanceComparison: [
            {
              lineId: 'EWL',
              status: 'ongoing_disruption',
              uptimeRatio: 0.995,
              issueCount: 2,
            },
            {
              lineId: 'NSL',
              status: 'normal',
              uptimeRatio: 1,
              issueCount: 0,
            },
          ],
          totalDowntimeDurationSeconds: 900,
          downtimeDurationByIssueType: { disruption: 900 },
          yearsOfOperation: 39,
          dateCount: 90,
        },
        included: {
          lines: {
            EWL: {
              id: 'EWL',
              name: translations('East West Line'),
            },
            NSL: {
              id: 'NSL',
              name: translations('North South Line'),
            },
          },
          stations: {},
          issues: {
            'issue-1': issue('issue-1', 'Power fault'),
          },
          landmarks: {},
          towns: {},
          operators: {
            SMRT: {
              id: 'SMRT',
              name: translations('SMRT Trains'),
              foundedAt: '1987-08-06',
            },
          },
        },
      } as unknown as Parameters<typeof getOperatorMarkdown>[0],
      { rootUrl: 'https://example.com' },
    );

    expect(markdown).toContain('# SMRT Trains');
    expect(markdown).toContain('Current status: Some lines disrupted.');
    expect(markdown).toContain('Aggregate uptime: 99.75%');
    expect(markdown).toContain('Total recent downtime: 15m');
    expect(markdown).toMatch(
      /\| EWL\s+\| East West Line\s+\| Disruption\s+\| 99\.5%\s+\| 2\s+\| \/lines\/EWL\/index\.md \|/,
    );
    expect(markdown).toContain(
      '[East West Line](https://example.com/lines/EWL/index.md)',
    );
    expect(markdown).toContain(
      '[Power fault](https://example.com/issues/issue-1/index.md)',
    );
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

function issue(
  id: string,
  title: string,
  type: 'disruption' | 'maintenance' | 'infra' = 'disruption',
) {
  return {
    id,
    title: translations(title),
    type,
    durationSeconds: 300,
    lineIds: ['EWL'],
    branchesAffected: [],
    intervals: [],
    subtypes: [],
  };
}
