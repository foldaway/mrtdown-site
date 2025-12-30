import classNames from 'classnames';
import { FormattedMessage } from 'react-intl';
import type { OperatorProfile } from '~/client';

interface Props {
  currentOperationalStatus: OperatorProfile['currentOperationalStatus'];
  linesAffected: string[];
}

const StatusLabels: Record<
  OperatorProfile['currentOperationalStatus'],
  { id: string; defaultMessage: string }
> = {
  all_operational: {
    id: 'operator.status.all_operational',
    defaultMessage: 'All Lines Operational',
  },
  some_lines_disrupted: {
    id: 'operator.status.some_lines_disrupted',
    defaultMessage: 'Some Lines Disrupted',
  },
  some_lines_under_maintenance: {
    id: 'operator.status.some_lines_under_maintenance',
    defaultMessage: 'Some Lines Under Maintenance',
  },
};

export const OperatorCurrentStatusCard: React.FC<Props> = (props) => {
  const { currentOperationalStatus, linesAffected } = props;

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
            'bg-operational-light dark:bg-operational-dark':
              currentOperationalStatus === 'all_operational',
            'bg-disruption-light dark:bg-disruption-dark':
              currentOperationalStatus === 'some_lines_disrupted',
            'bg-maintenance-light dark:bg-maintenance-dark':
              currentOperationalStatus === 'some_lines_under_maintenance',
          })}
        />
        <span className="text-sm">
          <FormattedMessage {...StatusLabels[currentOperationalStatus]} />
        </span>
      </div>

      {linesAffected.length > 0 && (
        <span className="mt-2 text-gray-500 text-xs dark:text-gray-400">
          <FormattedMessage
            id="operator.lines_affected"
            defaultMessage="{count, plural, one {# line affected} other {# lines affected}}"
            values={{ count: linesAffected.length }}
          />
        </span>
      )}

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

