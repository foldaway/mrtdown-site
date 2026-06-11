import {
  formatMarkdownDate,
  markdownTable,
  serializeAgentMarkdown,
} from '../agentMarkdown';
import {
  communitySignalsSection,
  compactRootContent,
  entityName,
  formatBranchStationCount,
  formatDurationNullable,
  formatIssueCounts,
  formatPercent,
  heading,
  issueListOrEmpty,
  LINE_STATUS_LABELS,
  link,
  list,
  paragraph,
  stationLinksSection,
  stationNames,
  text,
} from './shared';
import { DEFAULT_ROOT_URL, type AgentMarkdownOptions } from './types';
import type { LineProfilePayload } from './types';

export function getLineMarkdown(
  payload: LineProfilePayload,
  options?: AgentMarkdownOptions,
) {
  const rootUrl = options?.rootUrl ?? DEFAULT_ROOT_URL;
  const { data, included } = payload;
  const line = included.lines[data.lineId];
  const lineName = line != null ? entityName(line) : data.lineId;
  const operators =
    line?.operators
      .map((entry) => included.operators[entry.operatorId])
      .filter((operator) => operator != null)
      .map((operator) => entityName(operator)) ?? [];
  const recentIssues = data.issueIdsRecent
    .map((issueId) => included.issues[issueId])
    .filter((issue) => issue != null);
  const nextMaintenance =
    data.issueIdNextMaintenance != null
      ? included.issues[data.issueIdNextMaintenance]
      : null;
  const branchRows = data.branches.map((branch) => [
    branch.id,
    formatBranchStationCount(branch.stationIds.length),
    stationNames(branch.stationIds, included).join(', '),
  ]);
  const branchTable = markdownTable({
    headers: ['Branch', 'Stations', 'Station order'],
    rows: branchRows,
  });

  return serializeAgentMarkdown(
    compactRootContent([
      heading(1, `${lineName} (${data.lineId})`),
      paragraph([
        text(`Current status: ${LINE_STATUS_LABELS[data.lineSummary.status]}.`),
      ]),
      heading(2, 'Links'),
      list([
        [link('Human page', `/lines/${data.lineId}`, rootUrl)],
        [link('Overview Markdown', '/index.md', rootUrl)],
      ]),
      heading(2, 'Facts'),
      list([
        [text(`Line ID: ${data.lineId}`)],
        [text(`Operators: ${operators.join(', ') || 'Unknown'}`)],
        [
          text(
            `Started: ${
              line?.startedAt != null
                ? formatMarkdownDate(line.startedAt)
                : 'Future'
            }`,
          ),
        ],
        [text(`Recent uptime: ${formatPercent(data.lineSummary.uptimeRatio)}`)],
        [
          text(
            `Recent downtime: ${formatDurationNullable(
              data.lineSummary.totalDowntimeSeconds,
            )}`,
          ),
        ],
        [text(`Issue counts: ${formatIssueCounts(data.issueCountByType)}`)],
      ]),
      ...issueListOrEmpty(
        'Next Planned Maintenance',
        nextMaintenance != null ? [nextMaintenance] : [],
        rootUrl,
      ),
      ...issueListOrEmpty('Recent Issues', recentIssues, rootUrl),
      heading(2, 'Branches'),
      branchTable,
      ...stationLinksSection(
        'Interchanges',
        data.stationIdsInterchanges,
        included,
        rootUrl,
      ),
      ...communitySignalsSection(data.communitySignals, included, rootUrl),
    ]),
  );
}
