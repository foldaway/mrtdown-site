import type React from 'react';
import { FormattedMessage, FormattedNumber, useIntl } from 'react-intl';
import { ComponentBar } from '~/components/ComponentBar';
import { useHydrated } from '../../../hooks/useHydrated';
import type { Statistics } from '../../../types';

interface Props {
  statistics: Statistics;
}

export const StationsIssueCountCard: React.FC<Props> = (props) => {
  const { statistics } = props;

  const intl = useIntl();

  const isHydrated = useHydrated();

  return (
    <>
      <div className="flex flex-col rounded-lg border border-gray-300 p-6 shadow-lg sm:col-span-2 dark:border-gray-700">
        <span className="text-base">
          <FormattedMessage
            id="general.station_issue_counts"
            defaultMessage="Issue Count by Station"
          />
        </span>
        <div className="mt-2.5 flex max-h-40 flex-col overflow-y-scroll sm:max-h-[450px]">
          {statistics.stationIssues.map(({ station, count }) => (
            <div
              key={station.id}
              className="flex items-center justify-between px-4 py-1 even:bg-gray-100 dark:even:bg-gray-800"
            >
              <div className="flex items-center gap-x-2">
                <ComponentBar
                  componentIds={Object.keys(station.componentMembers)}
                />
                <span className="truncate text-sm">
                  {station.name_translations[intl.locale] ?? station.name}
                </span>
              </div>
              <span className="font-bold text-sm">
                {isHydrated ? <FormattedNumber value={count} /> : count}
              </span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
};
