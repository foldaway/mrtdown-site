import { FormattedMessage, useIntl } from 'react-intl';
import type { StationArrivalsV2 } from '~/util/stationArrivalsV2';
import type { ArrivalStates } from './stationArrivalRefresh';

type ScheduledResponse = Extract<StationArrivalsV2, { source: 'scheduled' }>;
type TimetableCredit = Omit<
  NonNullable<ScheduledResponse['attributions']>[number],
  'retrievedAt'
> & { date: string };
type TimetableSourcesProps = { states: ArrivalStates };

export function TimetableSources({ states }: TimetableSourcesProps) {
  const intl = useIntl();
  const credits = new Map<string, TimetableCredit>();
  for (const { data } of Object.values(states)) {
    if (data?.source !== 'scheduled') continue;
    for (const { source, retrievedAt, licenceUrl } of data.attributions ?? []) {
      const date = intl.formatDate(retrievedAt, {
        dateStyle: 'medium',
        timeZone: 'Asia/Singapore',
      });
      credits.set(JSON.stringify([source, date, licenceUrl]), {
        source,
        date,
        licenceUrl,
      });
    }
  }
  if (credits.size === 0) return null;

  return (
    <details className="border-gray-200 border-t px-4 py-1 text-gray-600 text-xs sm:px-6 dark:border-gray-700 dark:text-gray-300">
      <summary className="w-fit cursor-pointer rounded py-2 hover:underline focus-visible:outline-2 focus-visible:outline-blue-500">
        <FormattedMessage
          id="station.arrivals.timetable_sources"
          defaultMessage="Timetable sources"
        />
      </summary>
      <ul className="space-y-1 pb-2">
        {[...credits].map(([key, { source, date, licenceUrl }]) => (
          <li key={key}>
            <FormattedMessage
              id="station.arrivals.attribution"
              defaultMessage="GTFS schedule data from {source}, accessed {date}. <licence>Dataset licence</licence>"
              values={{
                source,
                date,
                licence: (label) => (
                  <a className="underline" href={licenceUrl}>
                    {label}
                  </a>
                ),
              }}
            />
          </li>
        ))}
      </ul>
    </details>
  );
}
