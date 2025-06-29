import { DateTime } from 'luxon';
import { Fragment, useMemo } from 'react';
import {
  createIntl,
  FormattedDate,
  FormattedMessage,
  type IntlShape,
  useIntl,
} from 'react-intl';
import { Link } from 'react-router';
import { IssueRefViewer } from '~/components/IssuesHistoryPageViewer/components/IssueRefViewer';
import { StationBar } from '~/components/StationBar';
import { ComponentTypeLabels, StationStructureTypeLabels } from '~/constants';
import { buildIssueTypeCountStringWithArray } from '~/helpers/buildIssueTypeCountString';
import { buildLocaleAwareLink } from '~/helpers/buildLocaleAwareLink';
import { useHydrated } from '~/hooks/useHydrated';
import type { Component, IssueRef, Station, StationManifest } from '~/types';
import { assert } from '../util/assert';
import type { Route } from './+types/($lang).stations.$stationId';

function computeStationStrings(
  intl: IntlShape,
  station: Station,
  componentsById: Record<string, Component>,
) {
  const town = station.town_translations[intl.locale] ?? station.town;
  const landmarks =
    station.landmarks_translations[intl.locale] ?? station.landmarks;

  let memberCount = 0;
  const _componentTypeStrings = new Set<string>();
  const _stationStructureTypes = new Set<string>();
  const stationCodes = new Set<string>();

  for (const [componentId, members] of Object.entries(
    station.componentMembers,
  )) {
    const component = componentsById[componentId];
    _componentTypeStrings.add(
      intl.formatMessage(ComponentTypeLabels[component.type]),
    );

    for (const member of members) {
      _stationStructureTypes.add(
        intl.formatMessage(StationStructureTypeLabels[member.structureType]),
      );
      stationCodes.add(member.code);
      memberCount++;
    }
  }
  return {
    town,
    landmarks,
    stationCodes,
    componentTypeStrings: Array.from(_componentTypeStrings),
    stationStructureTypes: Array.from(_stationStructureTypes),
    isInterchange: memberCount > 1,
  };
}

export async function loader({ params, context }: Route.LoaderArgs) {
  const { stationId, lang = 'en-SG' } = params;

  const rootUrl = context.cloudflare.env.ROOT_URL;

  const res = await fetch(
    `https://data.mrtdown.foldaway.space/product/station_${stationId}.json`,
  );
  assert(res.ok, res.statusText);
  const stationManifest: StationManifest = await res.json();

  const { default: messages } = await import(`../../lang/${lang}.json`);

  const intl = createIntl({
    locale: lang,
    messages,
  });

  const { station, componentsById, issueRefs } = stationManifest;

  const stationName = station.name_translations[lang] ?? station.name;

  const title = intl.formatMessage(
    {
      id: 'general.station_title',
      defaultMessage: '{stationName} Station',
    },
    { stationName },
  );

  const {
    town,
    landmarks,
    stationCodes,
    componentTypeStrings,
    stationStructureTypes,
    isInterchange,
  } = computeStationStrings(intl, station, componentsById);

  const issueTypeCountString = buildIssueTypeCountStringWithArray(
    issueRefs,
    intl,
  );

  const description = isInterchange
    ? intl.formatMessage(
        {
          id: 'station.description.interchange',
          defaultMessage:
            '{stationName} station is a {componentTypes} interchange station, located in {area} near {landmarks}. There have been {issueTypeCountString}.',
        },
        {
          stationName,
          componentTypes: intl.formatList(componentTypeStrings),
          area: town,
          landmarks: intl.formatList(landmarks),
          issueTypeCountString,
        },
      )
    : intl.formatMessage(
        {
          id: 'station.description.non_interchange',
          defaultMessage:
            '{stationName} station is an {structureTypes} {componentTypes} station, located in {area} near {landmarks}. There have been {issueTypeCountString}.',
        },
        {
          stationName,
          area: town,
          landmarks: intl.formatList(landmarks),
          structureTypes: intl.formatList(stationStructureTypes),
          componentTypes: intl.formatList(componentTypeStrings),
          issueTypeCountString,
        },
      );

  return {
    stationManifest,
    title,
    description,
    stationName,
    stationCodes: Array.from(stationCodes),
    rootUrl,
  };
}

export function headers() {
  return {
    'Cache-Control': 'max-age=60, s-maxage=60',
  };
}

export const meta: Route.MetaFunction = ({ data, location }) => {
  const { title, description, stationName, stationCodes, rootUrl } = data;

  const ogUrl = new URL(location.pathname, rootUrl).toString();
  const ogImage = new URL('/og_image.png', rootUrl).toString();

  return [
    {
      title,
    },
    {
      name: 'description',
      content: description,
    },
    {
      property: 'og:title',
      content: title,
    },
    {
      property: 'og:type',
      content: 'website',
    },
    {
      property: 'og:description',
      content: description,
    },
    {
      property: 'og:url',
      content: ogUrl,
    },
    {
      property: 'og:image',
      content: ogImage,
    },
    {
      'script:ld+json': {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: title,
        mainEntity: {
          '@type': 'TrainStation',
          name: stationName,
          alternateName: stationCodes.join(' / '),
          description,
        },
        url: ogUrl,
        image: ogImage,
      },
    },
  ];
};

const StationPage: React.FC<Route.ComponentProps> = (props) => {
  const { loaderData } = props;
  const { stationManifest } = loaderData;
  const { station, componentsById } = stationManifest;

  const intl = useIntl();
  const isHydrated = useHydrated();

  const stationName = useMemo(() => {
    return station.name_translations[intl.locale] ?? station.name;
  }, [station, intl.locale]);

  const {
    town,
    landmarks,
    componentTypeStrings,
    stationStructureTypes,
    isInterchange,
  } = useMemo(() => {
    return computeStationStrings(intl, station, componentsById);
  }, [station, intl, componentsById]);

  const issueTypeCountString = useMemo(() => {
    return buildIssueTypeCountStringWithArray(stationManifest.issueRefs, intl);
  }, [stationManifest.issueRefs, intl]);

  const issuesGrouped = useMemo(() => {
    const groups: Record<string, IssueRef[]> = {};

    for (const issueRef of stationManifest.issueRefs) {
      const startedAt = DateTime.fromISO(issueRef.startAt).setZone(
        'Asia/Singapore',
      );
      assert(startedAt.isValid);
      const key = startedAt.startOf('year').toFormat('yyyy');
      const temp = groups[key] ?? [];
      temp.push(issueRef);
      groups[key] = temp;
    }

    const keys = Object.keys(groups);
    keys.sort().reverse();

    return keys.map((key) => {
      return {
        key,
        issueRefs: groups[key],
      };
    });
  }, [stationManifest.issueRefs]);

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-x-1.5">
        <StationBar station={station} componentsById={componentsById} />
        <span className="font-bold text-gray-800 text-xl dark:text-gray-100">
          {stationName}
          {station.name !== stationName && ` ${station.name}`}
        </span>
      </div>

      <span className="mt-1 text-gray-600 text-sm dark:text-gray-400">
        {isInterchange ? (
          <FormattedMessage
            id="station.description.interchange"
            defaultMessage="{stationName} station is a {componentTypes} interchange station, located in {area} near {landmarks}. There have been {issueTypeCountString}."
            values={{
              stationName,
              componentTypes: intl.formatList(componentTypeStrings),
              area: town,
              landmarks: intl.formatList(landmarks),
              issueTypeCountString,
            }}
          />
        ) : (
          <FormattedMessage
            id="station.description.non_interchange"
            defaultMessage="{stationName} station is an {structureTypes} {componentTypes} station, located in {area} near {landmarks}. There have been {issueTypeCountString}."
            values={{
              stationName,
              area: town,
              landmarks: intl.formatList(landmarks),
              structureTypes: intl.formatList(stationStructureTypes),
              componentTypes: intl.formatList(componentTypeStrings),
              issueTypeCountString,
            }}
          />
        )}
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
              <th className="sm:!table-cell hidden p-2 text-start">
                <FormattedMessage
                  id="general.structure"
                  defaultMessage="Structure"
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
                          className="p-2 align-middle"
                          rowSpan={componentMemberEntries.length}
                        >
                          <Link
                            className="group flex flex-wrap items-center gap-x-1 gap-y-0.5"
                            to={buildLocaleAwareLink(
                              `/lines/${componentId}`,
                              intl.locale,
                            )}
                          >
                            <span
                              className="rounded-md px-2 py-1 font-semibold text-white text-xs leading-none"
                              style={{
                                backgroundColor:
                                  componentsById[componentId].color,
                              }}
                            >
                              {componentId}
                            </span>
                            <span className="text-sm group-hover:underline">
                              {componentsById[componentId].title_translations[
                                intl.locale
                              ] ?? componentsById[componentId].title}
                            </span>
                          </Link>
                        </td>
                      )}

                      <td className="p-2 align-middle">
                        <div className="inline-flex items-center rounded-lg border border-gray-300 px-2 py-0.5 dark:border-gray-700">
                          <span className="text-gray-500 text-sm leading-none dark:text-gray-400">
                            {entry.code}
                          </span>
                        </div>
                      </td>
                      <td className="sm:!table-cell hidden p-2 align-middle">
                        <span className="text-gray-500 text-sm leading-none dark:text-gray-400">
                          <FormattedMessage
                            {...StationStructureTypeLabels[entry.structureType]}
                          />
                        </span>
                      </td>
                      <td className="p-2 align-middle">
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
                      <td className="p-2 align-middle">
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
            count: stationManifest.issueRefs.length,
          }}
        />
      </h2>

      <div className="mt-2 flex flex-col gap-y-2">
        {issuesGrouped.map((group) => (
          <div key={group.key} className="flex flex-col gap-y-2">
            <span className="font-bold text-base text-gray-700 dark:text-gray-50">
              {isHydrated ? (
                <FormattedDate
                  value={DateTime.fromISO(group.key).toJSDate()}
                  year="numeric"
                />
              ) : (
                group.key
              )}
            </span>
            {group.issueRefs.map((issueRef) => (
              <IssueRefViewer key={issueRef.id} issueRef={issueRef} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

export default StationPage;
