import type React from 'react';
import { useMemo } from 'react';
import { FormattedMessage } from 'react-intl';
import type { IssueRef, IssueType } from '~/types';

interface Props {
  issues: IssueRef[];
}

export const StatusBanner: React.FC<Props> = (props) => {
  const { issues } = props;

  const countByIssueType = useMemo(() => {
    const result: Record<IssueType, number> = {
      disruption: 0,
      maintenance: 0,
      infra: 0,
    };

    for (const issue of issues) {
      result[issue.type]++;
    }

    return result;
  }, [issues]);

  if (countByIssueType.disruption > 0) {
    return (
      <h2 className="rounded bg-disruption-light px-4 py-2 font-bold text-gray-50 text-lg dark:bg-disruption-dark dark:text-gray-100">
        <FormattedMessage
          id="status.banner.ongoing_disruption"
          defaultMessage="Ongoing Disruption"
        />
      </h2>
    );
  }

  if (countByIssueType.maintenance > 0) {
    return (
      <h2 className="rounded bg-maintenance-light px-4 py-2 font-bold text-gray-50 text-lg dark:bg-maintenance-dark dark:text-gray-100">
        <FormattedMessage
          id="status.banner.ongoing_maintenance"
          defaultMessage="Ongoing Maintenance"
        />
      </h2>
    );
  }

  if (countByIssueType.infra > 0) {
    return (
      <h2 className="rounded bg-infra-light px-4 py-2 font-bold text-gray-50 text-lg dark:bg-infra-dark dark:text-gray-100">
        <FormattedMessage
          id="status.banner.ongoing_infra"
          defaultMessage="Ongoing Infrastructure Issues"
        />
      </h2>
    );
  }

  return (
    <h2 className="rounded bg-operational-light px-4 py-2 font-bold text-gray-50 text-lg dark:bg-operational-dark dark:text-gray-100">
      <FormattedMessage
        id="general.all_systems_operational"
        defaultMessage="All Systems Operational"
      />
    </h2>
  );
};
