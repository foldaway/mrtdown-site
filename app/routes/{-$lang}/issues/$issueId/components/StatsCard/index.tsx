import { FormattedMessage } from 'react-intl';
import type { Issue } from '~/types';
import { Disruption } from './components/Disruption';
import { Infrastructure } from './components/Infrastructure';
import { Maintenance } from './components/Maintenance';

interface Props {
  issue: Issue;
}

export const StatsCard: React.FC<Props> = (props) => {
  const { issue } = props;

  return (
    <section
      aria-labelledby="issue-statistics-heading"
      className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800"
    >
      <div className="px-4 py-2.5 sm:px-5 sm:py-3">
        <h2
          id="issue-statistics-heading"
          className="font-bold text-base text-gray-900 leading-tight dark:text-gray-100"
        >
          <FormattedMessage
            id="issue.details.stats"
            defaultMessage="Statistics"
          />
        </h2>
      </div>

      <dl className="grid grid-cols-2 gap-2 border-gray-200 border-t bg-gray-50/60 p-3 dark:border-gray-700 dark:bg-gray-900/20">
        {issue.type === 'disruption' && <Disruption issue={issue} />}
        {issue.type === 'maintenance' && <Maintenance issue={issue} />}
        {issue.type === 'infra' && <Infrastructure issue={issue} />}
      </dl>
    </section>
  );
};
