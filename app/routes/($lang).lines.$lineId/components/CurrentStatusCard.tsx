import classNames from 'classnames';
import { FormattedMessage } from 'react-intl';
import type { LineSummary } from '~/client';
import { LineSummaryStatusLabels } from '~/constants';

interface Props {
  lineSummary: LineSummary;
}

export const CurrentStatusCard: React.FC<Props> = (props) => {
  const { lineSummary } = props;
  const { status } = lineSummary;

  return (
    <div className="flex flex-col rounded-lg border border-gray-300 p-6 text-gray-800 shadow-lg md:col-span-4 dark:border-gray-700 dark:text-gray-200">
      <span className="mb-2 font-semibold text-base text-gray-900 dark:text-white">
        <FormattedMessage
          id="general.current_status"
          defaultMessage="Current Status"
        />
      </span>
      <div className="flex items-center gap-x-2">
        <div
          className={classNames('size-3 rounded-full', {
            'bg-disruption-light dark:bg-disruption-dark':
              status === 'ongoing_disruption',
            'bg-maintenance-light dark:bg-maintenance-dark':
              status === 'ongoing_maintenance',
            'bg-infra-light dark:bg-infra-dark': status === 'ongoing_infra',
            'bg-operational-light dark:bg-operational-dark':
              status === 'normal',
            'bg-gray-400 dark:bg-gray-500':
              status === 'closed_for_day' || status === 'future_service',
          })}
        />
        <span className="text-sm">
          <FormattedMessage {...LineSummaryStatusLabels[status]} />
        </span>
      </div>

      <span className="mt-2 text-gray-500 text-xs dark:text-gray-400">
        <FormattedMessage
          id="lines.current_status.timestamp"
          defaultMessage="As of {timestamp, time, short}"
          values={{ timestamp: new Date() }}
        />
      </span>
    </div>
  );
};
