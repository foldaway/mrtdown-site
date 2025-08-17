import type { IntlShape } from 'react-intl';
import type { IssueType } from '~/client';

export function buildIssueTypeCountString(
  issueCountByType: Record<IssueType, number>,
  intl: IntlShape,
) {
  let totalCount = 0;
  for (const count of Object.values(issueCountByType)) {
    totalCount += count;
  }

  if (totalCount === 0) {
    return intl.formatMessage({
      id: 'general.issue_count_empty',
      defaultMessage: 'no issues',
    });
  }

  const result: string[] = [];
  if (issueCountByType.disruption > 0) {
    result.push(
      intl.formatMessage(
        {
          id: 'general.disruption_count',
          defaultMessage:
            '{count, plural, one {{count} disruption} other {{count} disruptions}}',
        },
        {
          count: issueCountByType.disruption,
        },
      ),
    );
  }
  if (issueCountByType.maintenance > 0) {
    result.push(
      intl.formatMessage(
        {
          id: 'general.maintenance_count',
          defaultMessage:
            '{count, plural, one {{count} maintenance operation} other {{count} maintenance operations}}',
        },
        {
          count: issueCountByType.maintenance,
        },
      ),
    );
  }
  if (issueCountByType.infra > 0) {
    result.push(
      intl.formatMessage(
        {
          id: 'general.infra_count',
          defaultMessage:
            '{count, plural, one {{count} infrastructure issue} other {{count} infrastructure issues}}',
        },
        {
          count: issueCountByType.infra,
        },
      ),
    );
  }
  return intl.formatList(result);
}
