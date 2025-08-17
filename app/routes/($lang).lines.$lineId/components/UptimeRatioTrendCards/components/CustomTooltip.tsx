import { Duration } from 'luxon';
import type React from 'react';
import { FormattedDate, FormattedMessage, FormattedNumber } from 'react-intl';
import type { ChartEntry, Granularity } from '~/client';
import { FormattedDuration } from '~/components/FormattedDuration';
import { getDateFormatOptions } from '../../../../../helpers/getDateFormatOptions';

interface Props {
  active?: boolean;
  payload: {
    payload: ChartEntry;
  }[];
  label?: string;
  granularity: Granularity;
}

export const CustomTooltip: React.FC<Props> = (props) => {
  const { active, payload, label, granularity } = props;

  if (!active) {
    return null;
  }

  const data = payload[0].payload;

  return (
    <div className="flex flex-col rounded border border-gray-300 bg-gray-50 px-4 py-1 dark:border-gray-700 dark:bg-gray-800">
      <span className="mb-1 text-gray-900 text-xs dark:text-gray-50">
        <FormattedDate value={label} {...getDateFormatOptions(granularity)} />
      </span>
      <div className="flex items-center justify-between gap-x-2">
        <div className="flex items-center">
          <div className="size-2 rounded-full bg-sky-600 dark:bg-sky-700" />
        </div>
        <span className="text-gray-400 text-xs dark:text-gray-500">
          <FormattedMessage id="general.uptime" defaultMessage="Uptime" />
        </span>
        <span className="ms-auto text-xs">
          <FormattedNumber
            value={data.payload.uptimeRatio ?? 0}
            style="percent"
            maximumFractionDigits={2}
          />
        </span>
      </div>
      {'breakdown.disruption' in data.payload && (
        <div className="flex items-center justify-between gap-x-2">
          <div className="flex items-center">
            <div className="size-2 rounded-full bg-disruption-light dark:bg-disruption-dark" />
          </div>
          <span className="text-gray-400 text-xs dark:text-gray-500">
            <FormattedMessage
              id="general.disruption"
              defaultMessage="Disruption"
            />
          </span>
          <span className="ms-auto text-xs">
            <FormattedDuration
              duration={Duration.fromObject({
                seconds: data.payload['breakdown.disruption'],
              })}
            />
          </span>
        </div>
      )}
      {'breakdown.maintenance' in data.payload && (
        <div className="flex items-center justify-between gap-x-2">
          <div className="flex items-center">
            <div className="size-2 rounded-full bg-maintenance-light dark:bg-maintenance-dark" />
          </div>
          <span className="text-gray-400 text-xs dark:text-gray-500">
            <FormattedMessage
              id="general.maintenance"
              defaultMessage="Maintenance"
            />
          </span>
          <span className="ms-auto text-xs">
            <FormattedDuration
              duration={Duration.fromObject({
                seconds: data.payload['breakdown.maintenance'],
              })}
            />
          </span>
        </div>
      )}
    </div>
  );
};
