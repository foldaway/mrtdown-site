import {
  formatMarkdownDateTime,
  formatMarkdownDurationSeconds,
  markdownTable,
  serializeAgentMarkdown,
} from '../agentMarkdown';
import {
  compactRootContent,
  entityName,
  formatLineList,
  formatSubtypes,
  heading,
  ISSUE_TYPE_LABELS,
  issueTitle,
  link,
  list,
  paragraph,
  stationNames,
  text,
} from './shared';
import { DEFAULT_ROOT_URL, type AgentMarkdownOptions } from './types';
import type { IssuePayload } from './types';

export function getIssueMarkdown(
  payload: IssuePayload,
  options?: AgentMarkdownOptions,
) {
  const rootUrl = options?.rootUrl ?? DEFAULT_ROOT_URL;
  const { data, included } = payload;
  const issue = included.issues[data.id];
  const title = issue != null ? issueTitle(issue) : data.id;
  const intervalsTable =
    issue == null
      ? null
      : markdownTable({
          headers: ['Status', 'Start', 'End'],
          rows: issue.intervals.map((interval) => [
            interval.status,
            formatMarkdownDateTime(interval.startAt),
            interval.endAt != null
              ? formatMarkdownDateTime(interval.endAt)
              : 'Ongoing',
          ]),
        });
  const affectedRows =
    issue?.branchesAffected.map((branch) => {
      const line = included.lines[branch.lineId];
      return [
        branch.lineId,
        line != null ? entityName(line) : branch.lineId,
        stationNames(branch.stationIds, included).join(', '),
      ];
    }) ?? [];
  const affectedTable = markdownTable({
    headers: ['Line', 'Name', 'Affected stations'],
    rows: affectedRows,
  });
  const updateItems = data.updates.map((update) => [
    text(`${formatMarkdownDateTime(update.createdAt)}: ${update.text}`),
    ...(update.sourceUrl != null
      ? [text(' Source: '), link(update.sourceUrl, update.sourceUrl, rootUrl)]
      : []),
  ]);

  return serializeAgentMarkdown(
    compactRootContent([
      heading(1, title),
      ...(issue != null
        ? [
            paragraph([
              text(
                `${ISSUE_TYPE_LABELS[issue.type]} issue affecting ${formatLineList(
                  issue.lineIds,
                  included,
                )}.`,
              ),
            ]),
          ]
        : []),
      heading(2, 'Links'),
      list([
        [link('Human page', `/issues/${data.id}`, rootUrl)],
        [link('Overview Markdown', '/index.md', rootUrl)],
      ]),
      ...(issue != null
        ? [
            heading(2, 'Facts'),
            list([
              [text(`Issue ID: ${issue.id}`)],
              [text(`Type: ${ISSUE_TYPE_LABELS[issue.type]}`)],
              [text(`Subtypes: ${formatSubtypes(issue.subtypes)}`)],
              [
                text(
                  `Duration: ${formatMarkdownDurationSeconds(
                    issue.durationSeconds,
                  )}`,
                ),
              ],
            ]),
          ]
        : []),
      heading(2, 'Affected Network'),
      affectedTable,
      heading(2, 'Intervals'),
      intervalsTable,
      heading(2, 'Updates'),
      updateItems.length > 0
        ? list(updateItems)
        : paragraph([text('No updates are available.')]),
    ]),
  );
}
