import { markdownTable, serializeAgentMarkdown } from '../agentMarkdown';
import {
  communitySignalsSection,
  compactRootContent,
  entityName,
  formatDurationNullable,
  formatPercent,
  heading,
  issueListOrEmpty,
  LINE_STATUS_LABELS,
  link,
  list,
  paragraph,
  text,
} from './shared';
import { DEFAULT_ROOT_URL, type AgentMarkdownOptions } from './types';
import type { OverviewPayload } from './types';

export function getOverviewMarkdown(
  payload: OverviewPayload,
  options?: AgentMarkdownOptions,
) {
  const rootUrl = options?.rootUrl ?? DEFAULT_ROOT_URL;
  const { data, included } = payload;
  const activeNowIssues = data.issueIdsActiveNow
    .map((issueId) => included.issues[issueId])
    .filter((issue) => issue != null);
  const activeTodayIssues = data.issueIdsActiveToday
    .map((issueId) => included.issues[issueId])
    .filter((issue) => issue != null);

  const lineRows = data.lineSummaries.map((summary) => {
    const line = included.lines[summary.lineId];
    return [
      summary.lineId,
      line != null ? entityName(line) : summary.lineId,
      LINE_STATUS_LABELS[summary.status],
      formatPercent(summary.uptimeRatio),
      formatDurationNullable(summary.totalDowntimeSeconds),
      `/lines/${summary.lineId}/index.md`,
    ];
  });
  const lineTable = markdownTable({
    headers: [
      'Line',
      'Name',
      'Current status',
      'Uptime',
      'Downtime',
      'Markdown',
    ],
    rows: lineRows,
  });

  return serializeAgentMarkdown(
    compactRootContent([
      heading(1, 'Singapore MRT & LRT Service Status'),
      paragraph([
        text(
          'Current public read-model summary for Singapore MRT and LRT service status.',
        ),
      ]),
      heading(2, 'Links'),
      list([
        [link('Human page', '/', rootUrl)],
        [link('llms.txt', '/llms.txt', rootUrl)],
      ]),
      heading(2, 'Current Advisories'),
      ...issueListOrEmpty('Active disruptions now', activeNowIssues, rootUrl),
      ...issueListOrEmpty(
        'Planned maintenance and infrastructure advisories today',
        activeTodayIssues,
        rootUrl,
      ),
      heading(2, 'Line Status'),
      lineTable,
      ...communitySignalsSection(data.communitySignals, included, rootUrl),
    ]),
  );
}
