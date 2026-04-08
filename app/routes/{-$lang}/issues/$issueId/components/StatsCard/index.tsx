import { FormattedMessage } from 'react-intl';
import type { Issue } from '~/client';
import { Disruption } from './components/Disruption';
import { Infrastructure } from './components/Infrastructure';
import { Maintenance } from './components/Maintenance';

interface Props {
  issue: Issue;
}

export const StatsCard: React.FC<Props> = (props) => {
  const { issue } = props;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6 dark:border-gray-700 dark:bg-gray-800">
      <h2 className="font-semibold text-base text-gray-900 dark:text-gray-100">
        <FormattedMessage
          id="issue.details.stats"
          defaultMessage="Statistics"
        />
      </h2>

      <div className="mt-2 grid grid-cols-2 gap-2">
        {issue.type === 'disruption' && <Disruption issue={issue} />}
        {issue.type === 'maintenance' && <Maintenance issue={issue} />}
        {issue.type === 'infra' && <Infrastructure issue={issue} />}
      </div>
    </div>
  );
};
