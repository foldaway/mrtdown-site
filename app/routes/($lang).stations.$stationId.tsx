import type { Route } from './+types/($lang).stations.$stationId';
import { assert } from '../util/assert';
import type { StationManifest } from '~/types';
import { ComponentBar } from '~/components/ComponentBar';
import { FormattedDate, FormattedMessage, useIntl } from 'react-intl';
import { IssueRefViewer } from '~/components/IssuesHistoryPageViewer/components/IssueRefViewer';
import { Fragment, useMemo } from 'react';
import { DateTime } from 'luxon';
import { useHydrated } from '~/hooks/useHydrated';
import { Link } from 'react-router';
import { buildLocaleAwareLink } from '~/helpers/buildLocaleAwareLink';

export async function loader({ params }: Route.LoaderArgs) {
  const { stationId } = params;

  const res = await fetch(
    `https://data.mrtdown.foldaway.space/product/station_${stationId}.json`,
  );
  assert(res.ok, res.statusText);
  const stationManifest: StationManifest = await res.json();
  return stationManifest;
}

export function headers() {
  return {
    'Cache-Control': 'max-age=60, s-maxage=60',
  };
}

export const meta: Route.MetaFunction = ({ params, data }) => {
  const { lang = 'en-SG' } = params;

  return [
    {
      title: `${data.station.name_translations[lang] ?? data.station.name} | mrtdown`,
    },
  ];
};

const StationPage: React.FC<Route.ComponentProps> = (props) => {
  const { loaderData } = props;
  const { station } = loaderData;

  const intl = useIntl();
  const isHydrated = useHydrated();

  const stationName = useMemo(() => {
    return station.name_translations[intl.locale] ?? station.name;
  }, [station, intl.locale]);

  const stationCodes = useMemo(() => {
    const codes = new Set<string>();
    for (const members of Object.values(station.componentMembers)) {
      for (const member of members) {
        codes.add(member.code);
      }
    }
    return Array.from(codes);
  }, [station.componentMembers]);

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-x-2">
        <ComponentBar componentIds={Object.keys(station.componentMembers)} />
        <span className="font-bold text-gray-800 text-xl dark:text-gray-100">
          {stationName}
        </span>
      </div>

      <span className="mt-1 text-gray-600 text-sm dark:text-gray-400">
        <FormattedMessage
          id="general.station_description"
          defaultMessage="{stationName} is served by {lines}, with station codes {stationCodes}."
          values={{
            stationName,
            lines: intl.formatList(
              Object.keys(loaderData.station.componentMembers),
            ),
            stationCodes: intl.formatList(stationCodes),
          }}
        />
      </span>

      <h2 className="mt-4 font-bold text-gray-800 text-lg dark:text-gray-100">
        <FormattedMessage
          id="general.station_details"
          defaultMessage="Station Details"
        />
      </h2>
      <div className="mt-1 flex flex-col overflow-hidden rounded-lg border border-gray-300 dark:border-gray-700">
        <table className="table-auto">
          <thead>
            <tr className="border-gray-300 border-b bg-gray-100 text-gray-500 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
              <th className="p-2 text-start">
                <FormattedMessage id="general.line" defaultMessage="Line" />
              </th>
              <th className="p-2 text-start">
                <FormattedMessage
                  id="general.station_code"
                  defaultMessage="Station Code"
                />
              </th>
              <th className="p-2 text-start">
                <FormattedMessage id="general.opened" defaultMessage="Opened" />
              </th>
              <th className="p-2 text-start">
                <FormattedMessage id="general.closed" defaultMessage="Closed" />
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-300 dark:divide-gray-700">
            {Object.entries(station.componentMembers).map(
              ([componentId, componentMemberEntries]) => (
                <Fragment key={componentId}>
                  {componentMemberEntries.map((entry, index) => (
                    <tr
                      key={entry.code}
                      className="text-gray-900 dark:text-gray-200"
                    >
                      {index === 0 && (
                        <td
                          className="p-2 align-top"
                          rowSpan={componentMemberEntries.length}
                        >
                          <Link
                            className="flex hover:underline"
                            to={buildLocaleAwareLink(
                              `/lines/${componentId}`,
                              intl.locale,
                            )}
                          >
                            <ComponentBar
                              componentIds={[componentId]}
                              showName
                            />
                          </Link>
                        </td>
                      )}

                      <td className="p-2">
                        <div className="inline-flex items-center rounded-lg border border-gray-300 px-2 py-0.5 dark:border-gray-700">
                          <span className="text-gray-500 text-sm leading-none dark:text-gray-400">
                            {entry.code}
                          </span>
                        </div>
                      </td>
                      <td className="p-2">
                        <span className="text-sm">
                          {isHydrated ? (
                            <>
                              {DateTime.fromISO(entry.startedAt)
                                .diffNow()
                                .as('days') < 0 ? (
                                <>
                                  <FormattedDate
                                    value={entry.startedAt}
                                    day="numeric"
                                    month="long"
                                    year="numeric"
                                  />{' '}
                                  (
                                  {DateTime.fromISO(entry.startedAt)
                                    .reconfigure({ locale: intl.locale })
                                    .toRelative()}
                                  )
                                </>
                              ) : (
                                '-'
                              )}
                            </>
                          ) : (
                            entry.startedAt
                          )}
                        </span>
                      </td>
                      <td className="p-2">
                        <span className="text-sm">
                          {entry.endedAt != null ? (
                            <>
                              {isHydrated ? (
                                <>
                                  <FormattedDate
                                    value={entry.endedAt}
                                    day="numeric"
                                    month="long"
                                    year="numeric"
                                  />{' '}
                                  (
                                  {DateTime.fromISO(entry.endedAt)
                                    .reconfigure({ locale: intl.locale })
                                    .toRelative()}
                                  )
                                </>
                              ) : (
                                entry.endedAt
                              )}
                            </>
                          ) : (
                            '-'
                          )}
                        </span>
                      </td>
                    </tr>
                  ))}
                </Fragment>
              ),
            )}
          </tbody>
        </table>
      </div>

      <h2 className="mt-4 font-bold text-gray-800 text-lg dark:text-gray-100">
        <FormattedMessage
          id="general.issues_with_count"
          defaultMessage="Issues ({count})"
          values={{
            count: loaderData.issueRefs.length,
          }}
        />
      </h2>
      <div className="mt-1 flex flex-col gap-y-2">
        {loaderData.issueRefs.map((issueRef) => (
          <IssueRefViewer key={issueRef.id} issueRef={issueRef} />
        ))}
      </div>
    </div>
  );
};

export default StationPage;
