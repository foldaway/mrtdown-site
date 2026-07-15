import classNames from 'classnames';
import { FormattedMessage } from 'react-intl';
import type { LineSummary } from '~/types';
import { LineSummaryStatusLabels } from '~/constants';

interface Props {
  lineSummary: LineSummary;
}

export const CurrentStatusCard: React.FC<Props> = (props) => {
  const { lineSummary } = props;
  const { status } = lineSummary;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] content-start items-center gap-x-3 gap-y-2 px-4 py-3 text-gray-800 sm:px-5 sm:py-4 dark:text-gray-200">
      <h2 className="font-semibold text-gray-900 text-sm leading-5 dark:text-gray-100">
        <FormattedMessage
          id="general.current_status"
          defaultMessage="Current Status"
        />
      </h2>
      <div className="col-start-2 row-span-2 row-start-1 flex items-center gap-x-2">
        <div
          className={classNames('size-2.5 rounded-full ring-4', {
            'bg-disruption-light dark:bg-disruption-dark':
              status === 'ongoing_disruption',
            'bg-maintenance-light dark:bg-maintenance-dark':
              status === 'ongoing_maintenance',
            'bg-infra-light dark:bg-infra-dark': status === 'ongoing_infra',
            'bg-operational-light dark:bg-operational-dark':
              status === 'normal',
            'bg-gray-400 dark:bg-gray-500':
              status === 'closed_for_day' || status === 'future_service',
            'ring-red-50 dark:ring-red-950/50': status === 'ongoing_disruption',
            'ring-amber-50 dark:ring-amber-950/50':
              status === 'ongoing_maintenance',
            'ring-orange-50 dark:ring-orange-950/50':
              status === 'ongoing_infra',
            'ring-emerald-50 dark:ring-emerald-950/50': status === 'normal',
            'ring-gray-100 dark:ring-gray-700':
              status === 'closed_for_day' || status === 'future_service',
          })}
        />
        <span className="font-medium text-sm">
          <FormattedMessage {...LineSummaryStatusLabels[status]} />
        </span>
      </div>

      <span className="col-start-1 row-start-2 text-gray-500 text-xs dark:text-gray-400">
        <FormattedMessage
          id="lines.current_status.timestamp"
          defaultMessage="As of {timestamp, time, short}"
          values={{ timestamp: new Date() }}
        />
      </span>
    </div>
  );
};
