import {
  formatMarkdownDurationSeconds,
  markdownTable,
  serializeAgentMarkdown,
} from '../agentMarkdown';
import {
  compactRootContent,
  entityName,
  formatIssueCounts,
  formatPercent,
  heading,
  issueListOrEmpty,
  LINE_STATUS_LABELS,
  link,
  list,
  paragraph,
  stationLinksSection,
  text,
} from './shared';
import { DEFAULT_ROOT_URL, type AgentMarkdownOptions } from './types';
import type { OperatorProfilePayload } from './types';

const OPERATOR_STATUS_LABELS = {
  all_operational: 'All lines operational',
  all_lines_closed_for_day: 'All lines outside service hours',
  some_lines_disrupted: 'Some lines disrupted',
  some_lines_under_maintenance: 'Some lines under maintenance',
};

export function getOperatorMarkdown(
  payload: OperatorProfilePayload,
  options?: AgentMarkdownOptions,
) {
  const rootUrl = options?.rootUrl ?? DEFAULT_ROOT_URL;
  const { data, included } = payload;
  const operator = included.operators[data.operatorId];
  const operatorName =
    operator != null ? entityName(operator) : data.operatorId;
  const recentIssues = data.issueIdsRecent
    .map((issueId) => included.issues[issueId])
    .filter((issue) => issue != null);
  const performanceTable = markdownTable({
    headers: ['Line', 'Name', 'Status', 'Uptime', 'Issues', 'Markdown'],
    rows: data.linePerformanceComparison.map((performance) => {
      const line = included.lines[performance.lineId];
      return [
        performance.lineId,
        line != null ? entityName(line) : performance.lineId,
        LINE_STATUS_LABELS[performance.status],
        formatPercent(performance.uptimeRatio),
        performance.issueCount.toString(),
        `/lines/${performance.lineId}/index.md`,
      ];
    }),
  });

  return serializeAgentMarkdown(
    compactRootContent([
      heading(1, operatorName),
      paragraph([
        text(
          `Current status: ${
            OPERATOR_STATUS_LABELS[data.currentOperationalStatus]
          }.`,
        ),
      ]),
      heading(2, 'Links'),
      list([
        [link('Human page', `/operators/${data.operatorId}`, rootUrl)],
        [link('Overview Markdown', '/index.md', rootUrl)],
      ]),
      heading(2, 'Facts'),
      list([
        [text(`Operator ID: ${data.operatorId}`)],
        [text(`Lines operated: ${data.lineIds.length}`)],
        [text(`Stations operated: ${data.totalStationsOperated}`)],
        [text(`Founded: ${operator?.foundedAt ?? 'Unknown'}`)],
        [text(`Years of operation: ${data.yearsOfOperation}`)],
        [text(`Aggregate uptime: ${formatPercent(data.aggregateUptimeRatio)}`)],
        [
          text(
            `Total recent downtime: ${formatMarkdownDurationSeconds(
              data.totalDowntimeDurationSeconds,
            )}`,
          ),
        ],
        [text(`Issue counts: ${formatIssueCounts(data.totalIssuesByType)}`)],
      ]),
      heading(2, 'Line Performance'),
      performanceTable,
      ...stationLinksSection(
        'Lines Currently Affected',
        data.linesAffected,
        included,
        rootUrl,
        'line',
      ),
      ...issueListOrEmpty('Recent Issues', recentIssues, rootUrl),
    ]),
  );
}
