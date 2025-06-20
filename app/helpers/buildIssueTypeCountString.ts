import type { IntlShape } from 'react-intl';
import type { IssueRef, IssueType } from '~/types';

export function buildIssueTypeCountString(
  issueRefs: IssueRef[],
  intl: IntlShape,
) {
  const issueCountByType: Record<IssueType, number> = {
    disruption: 0,
    maintenance: 0,
    infra: 0,
  };
  for (const issueRef of issueRefs) {
    let count = issueCountByType[issueRef.type] ?? 0;
    count++;
    issueCountByType[issueRef.type] = count;
  }

  const result: string[] = [];
  if (issueRefs.length === 0 || issueCountByType.disruption > 0) {
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
  if (issueRefs.length === 0 || issueCountByType.maintenance > 0) {
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
  if (issueRefs.length === 0 || issueCountByType.infra > 0) {
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
