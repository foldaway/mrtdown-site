import type { IssueType } from '@mrtdown/core';
import type {
  Link,
  List,
  ListItem,
  Paragraph,
  PhrasingContent,
  RootContent,
} from 'mdast';
import {
  formatMarkdownDateTime,
  formatMarkdownDurationSeconds,
  markdownTable,
} from '../agentMarkdown';
import type { PublicCrowdReportSignal } from '../crowdReports';
import { getLocalizedTranslation } from '~/helpers/getLocalizedTranslation';
import type { IncludedEntities, Issue, LineSummaryStatus } from '~/types';

const DEFAULT_LOCALE = 'en-SG';

export const ISSUE_TYPE_LABELS = {
  disruption: 'Disruption',
  maintenance: 'Maintenance',
  infra: 'Infrastructure',
} satisfies Record<IssueType, string>;

export const LINE_STATUS_LABELS = {
  future_service: 'Under development',
  closed_for_day: 'Outside service hours',
  ongoing_disruption: 'Disruption',
  ongoing_maintenance: 'Maintenance',
  ongoing_infra: 'Infrastructure issue',
  normal: 'Operational',
} satisfies Record<LineSummaryStatus, string>;

const CROWD_REPORT_EFFECT_LABELS = {
  delay: 'Delay',
  'no-service': 'No service',
  crowding: 'Crowding',
  'skipped-stop': 'Train skipped stop',
  unknown: 'Not sure',
};

export function communitySignalsSection(
  signals: PublicCrowdReportSignal[],
  included: IncludedEntities,
  rootUrl: string,
): RootContent[] {
  if (signals.length === 0) {
    return [];
  }

  const rows = signals.map((signal) => [
    CROWD_REPORT_EFFECT_LABELS[signal.effect ?? 'unknown'],
    signal.reportCount.toString(),
    formatLineList(signal.lineIds, included),
    stationNames(signal.stationIds, included).join(', '),
    formatMarkdownDateTime(signal.updatedAt),
  ]);
  const table = markdownTable({
    headers: ['Effect', 'Reports', 'Lines', 'Stations', 'Updated'],
    rows,
  });

  return compactRootContent([
    heading(2, 'Community Reports'),
    paragraph([
      text(
        'Aggregated commuter reports shown separately from official operator advisories.',
      ),
    ]),
    table,
    paragraph([link('Submit report', '/report', rootUrl)]),
  ]);
}

export function issueListOrEmpty(
  title: string,
  issues: Issue[],
  rootUrl: string,
): RootContent[] {
  return [
    heading(3, title),
    issues.length > 0
      ? list(
          issues.map((issue) => [
            link(issueTitle(issue), `/issues/${issue.id}/index.md`, rootUrl),
            text(` (${ISSUE_TYPE_LABELS[issue.type]})`),
          ]),
        )
      : paragraph([text('None.')]),
  ];
}

export function stationLinksSection(
  title: string,
  ids: string[],
  included: IncludedEntities,
  rootUrl: string,
  entityType: 'station' | 'line' = 'station',
): RootContent[] {
  if (ids.length === 0) {
    return [];
  }

  return [
    heading(2, title),
    list(
      ids.map((id) => {
        if (entityType === 'line') {
          const line = included.lines[id];
          return [
            link(
              line != null ? entityName(line) : id,
              `/lines/${id}/index.md`,
              rootUrl,
            ),
          ];
        }
        const station = included.stations[id];
        return [
          link(
            station != null ? entityName(station) : id,
            `/stations/${id}/index.md`,
            rootUrl,
          ),
        ];
      }),
    ),
  ];
}

export function stationNames(stationIds: string[], included: IncludedEntities) {
  return stationIds.map((stationId) => {
    const station = included.stations[stationId];
    return station != null
      ? `${entityName(station)} (${stationId})`
      : stationId;
  });
}

export function formatLineList(lineIds: string[], included: IncludedEntities) {
  if (lineIds.length === 0) {
    return 'None';
  }

  return lineIds
    .map((lineId) => {
      const line = included.lines[lineId];
      return line != null ? `${entityName(line)} (${lineId})` : lineId;
    })
    .join(', ');
}

export function formatIssueCounts(counts: Partial<Record<IssueType, number>>) {
  return (Object.keys(ISSUE_TYPE_LABELS) as IssueType[])
    .map((type) => `${ISSUE_TYPE_LABELS[type]}: ${counts[type] ?? 0}`)
    .join(', ');
}

export function formatSubtypes(subtypes: string[]) {
  if (subtypes.length === 0) {
    return 'None';
  }
  return subtypes.map((subtype) => subtype.replaceAll('.', ' ')).join(', ');
}

export function formatPercent(value: number | null) {
  if (value == null) {
    return 'N/A';
  }

  return new Intl.NumberFormat(DEFAULT_LOCALE, {
    style: 'percent',
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatDurationNullable(value: number | null) {
  return value == null ? 'N/A' : formatMarkdownDurationSeconds(value);
}

export function formatBranchStationCount(count: number) {
  return `${count} ${count === 1 ? 'station' : 'stations'}`;
}

export function entityName(entity: {
  name: Parameters<typeof getLocalizedTranslation>[0];
}) {
  return getLocalizedTranslation(entity.name, DEFAULT_LOCALE);
}

export function issueTitle(issue: Issue) {
  return getLocalizedTranslation(issue.title, DEFAULT_LOCALE);
}

export function heading(depth: 1 | 2 | 3, value: string): RootContent {
  return {
    type: 'heading',
    depth,
    children: [text(value)],
  };
}

export function paragraph(children: PhrasingContent[]): Paragraph {
  return {
    type: 'paragraph',
    children,
  };
}

export function list(items: PhrasingContent[][]): List {
  return {
    type: 'list',
    ordered: false,
    spread: false,
    children: items.map(listItem),
  };
}

export function link(label: string, path: string, rootUrl: string): Link {
  return {
    type: 'link',
    url: new URL(path, rootUrl).toString(),
    children: [text(label)],
  };
}

export function text(value: string): PhrasingContent {
  return {
    type: 'text',
    value,
  };
}

export function compactRootContent(
  children: Array<RootContent | null>,
): RootContent[] {
  return children.filter((child) => child != null);
}

function listItem(children: PhrasingContent[]): ListItem {
  return {
    type: 'listItem',
    spread: false,
    children: [paragraph(children)],
  };
}
