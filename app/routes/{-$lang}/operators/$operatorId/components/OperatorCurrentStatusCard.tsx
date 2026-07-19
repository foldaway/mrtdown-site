import classNames from 'classnames';
import { FormattedMessage } from 'react-intl';
import type { OperatorProfile } from '~/util/dbQueries/operators';

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
  all_lines_closed_for_day: {
    id: 'status.service_ended',
    defaultMessage: 'Off Hours',
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
    <section className="h-full overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="border-gray-200 border-b px-4 py-2.5 sm:px-5 sm:py-3 dark:border-gray-700">
        <h2 className="font-bold text-gray-900 text-sm leading-5 dark:text-gray-100">
          <FormattedMessage
            id="general.current_status"
            defaultMessage="Current Status"
          />
        </h2>
      </div>
      <div className="px-4 py-3 sm:px-5 sm:py-4">
        <div className="flex items-center gap-x-2.5">
          <div
            className={classNames('size-2.5 shrink-0 rounded-full ring-4', {
              'bg-operational-light ring-emerald-50 dark:bg-operational-dark dark:ring-emerald-950/50':
                currentOperationalStatus === 'all_operational',
              'bg-disruption-light ring-red-50 dark:bg-disruption-dark dark:ring-red-950/50':
                currentOperationalStatus === 'some_lines_disrupted',
              'bg-maintenance-light ring-amber-50 dark:bg-maintenance-dark dark:ring-amber-950/50':
                currentOperationalStatus === 'some_lines_under_maintenance',
              'bg-gray-400 ring-gray-100 dark:bg-gray-500 dark:ring-gray-700':
                currentOperationalStatus === 'all_lines_closed_for_day',
            })}
          />
          <span className="font-semibold text-gray-900 text-sm dark:text-white">
            <FormattedMessage {...StatusLabels[currentOperationalStatus]} />
          </span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          {linesAffected.length > 0 && (
            <span className="rounded-full bg-gray-100 px-2 py-0.5 font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">
              <FormattedMessage
                id="operator.lines_affected"
                defaultMessage="{count, plural, one {# line affected} other {# lines affected}}"
                values={{ count: linesAffected.length }}
              />
            </span>
          )}
          <span className="text-gray-500 dark:text-gray-400">
            <FormattedMessage
              id="lines.current_status.timestamp"
              defaultMessage="As of {timestamp, time, short}"
              values={{ timestamp: new Date() }}
            />
          </span>
        </div>
      </div>
    </section>
  );
};
