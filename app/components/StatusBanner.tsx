import type React from 'react';
import { FormattedMessage } from 'react-intl';

interface Props {
  hasOngoingIssues: boolean;
}

export const StatusBanner: React.FC<Props> = (props) => {
  const { hasOngoingIssues } = props;

  if (hasOngoingIssues) {
    return (
      <h2 className="rounded bg-disruption-light px-4 py-2 font-bold text-gray-50 text-lg dark:bg-disruption-dark dark:text-gray-100">
        <FormattedMessage
          id="general.there_are_ongoing_issues"
          defaultMessage="Issues ongoing"
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
