import classNames from 'classnames';
import { DateTime } from 'luxon';
import { Fragment, useMemo } from 'react';
import {
  createIntl,
  FormattedDate,
  FormattedMessage,
  useIntl,
} from 'react-intl';
import { Link } from 'react-router';
import { IssueRefViewer } from '~/components/IssuesHistoryPageViewer/components/IssueRefViewer';
import { buildIssueTypeCountStringWithArray } from '~/helpers/buildIssueTypeCountString';
import { buildLocaleAwareLink } from '~/helpers/buildLocaleAwareLink';
import { useHydrated } from '~/hooks/useHydrated';
import type { ComponentManifest, IssueRef } from '~/types';
import { assert } from '../util/assert';
import type { Route } from './+types/($lang).lines.$lineId';

export async function loader({ params }: Route.LoaderArgs) {
  const { lineId, lang = 'en-SG' } = params;

  const rootUrl = process.env.ROOT_URL;

  const res = await fetch(
    `https://data.mrtdown.org/product/component_${lineId}.json`,
  );
  assert(res.ok, res.statusText);

  const componentManifest: ComponentManifest = await res.json();
  const component = componentManifest.componentsById[lineId];

  const stationIds = new Set<string>();
  for (const station of Object.values(componentManifest.stationsByCode)) {
    const componentMembers = station.componentMembers[lineId];
    const hasSomeComponentMembersInOperation = componentMembers.some(
      (member) => {
        if (member.endedAt != null) {
          return false;
        }
        return DateTime.fromISO(member.startedAt).diffNow().as('days') < 0;
      },
    );
    if (!hasSomeComponentMembersInOperation) {
      continue;
    }
    stationIds.add(station.id);
  }

  const { default: messages } = await import(`../../lang/${lang}.json`);

  const intl = createIntl({
    locale: lang,
    messages,
  });

  const componentName = component.title_translations[lang] ?? component.title;
  const title = componentName;

  const issueTypeCountString = buildIssueTypeCountStringWithArray(
    componentManifest.issueRefs,
    intl,
  );

  const description =
    DateTime.fromISO(component.startedAt).diffNow().as('days') < 0
      ? intl.formatMessage(
          {
            id: 'general.component_description',
            defaultMessage:
              'The {componentName} began operations on {startDate}. It currently has {stationCount, plural, one {# station} other {# stations}}, with {issueTypeCountString} reported to date.',
          },
          {
            stationCount: stationIds.size,
            componentName,
            startDate: intl.formatDate(component.startedAt, {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            }),
            issueTypeCountString,
          },
        )
      : '';

  return {
    title,
    description,
    componentManifest,
    rootUrl,
  };
}

export function headers() {
  return {
    'Cache-Control': 'max-age=60, s-maxage=60',
  };
}

export const meta: Route.MetaFunction = ({ params, data, location }) => {
  const { lang = 'en-SG' } = params;
  const { title, description, componentManifest, rootUrl } = data;
  const { componentId, componentsById, stationsByCode } = componentManifest;
  const component = componentsById[componentId];
  const componentName = component.title_translations[lang] ?? component.title;

  const ogUrl = new URL(location.pathname, rootUrl).toString();
  const ogImage = new URL('/og_image.png', rootUrl).toString();

  const stations = Object.fromEntries(
    Object.values(stationsByCode).map((station) => {
      return [station.id, station];
    }),
  );

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
          '@type': 'Place',
          name: componentName,
          identifier: component.id,
          containsPlace: Object.values(stations).map((station) => {
            const stationName = station.name_translations[lang] ?? station.name;

            const stationCodes = new Set<string>();
            for (const members of Object.values(station.componentMembers)) {
              for (const member of members) {
                stationCodes.add(member.code);
              }
            }

            return {
              '@type': 'TrainStation',
              name: stationName,
              alternateName: Array.from(stationCodes).join(' / '),
            };
          }),
        },
        url: ogUrl,
      },
    },
  ];
};

const ComponentPage: React.FC<Route.ComponentProps> = (props) => {
  const { loaderData } = props;
  const { componentManifest } = loaderData;
  const { componentId, componentsById, stationsByCode, issueRefs } =
    componentManifest;

  const component = componentsById[componentId];

  const isHydrated = useHydrated();

  const intl = useIntl();
  const componentName =
    component.title_translations[intl.locale] ?? component.title;

  const stationCount = useMemo(() => {
    const idSet = new Set<string>();
    for (const station of Object.values(stationsByCode)) {
      const componentMembers = station.componentMembers[componentId];
      const hasSomeComponentMembersInOperation = componentMembers.some(
        (member) => {
          if (member.endedAt != null) {
            return false;
          }
          return DateTime.fromISO(member.startedAt).diffNow().as('days') < 0;
        },
      );
      if (!hasSomeComponentMembersInOperation) {
        continue;
      }
      idSet.add(station.id);
    }
    return idSet.size;
  }, [stationsByCode, componentId]);

  const issueTypeCountString = useMemo(() => {
    return buildIssueTypeCountStringWithArray(issueRefs, intl);
  }, [issueRefs, intl]);

  const issuesGrouped = useMemo(() => {
    const groups: Record<string, IssueRef[]> = {};

    for (const issueRef of issueRefs) {
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
  }, [issueRefs]);

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-x-2">
        <span
          className="rounded-sm px-2 py-0.5 font-semibold text-white text-xs"
          style={{ backgroundColor: component.color }}
        >
          {component.id}
        </span>
        <h1 className="font-bold text-gray-800 text-xl dark:text-gray-100">
          {componentName}
          {component.title !== componentName && ` ${component.title}`}
        </h1>
      </div>

      {DateTime.fromISO(component.startedAt).diffNow().as('days') < 0 && (
        <span className="mt-1 text-gray-600 text-sm dark:text-gray-400">
          <FormattedMessage
            id="general.component_description"
            defaultMessage="The {componentName} began operations on {startDate}. It currently has {stationCount, plural, one {# station} other {# stations}}, with {issueTypeCountString} reported to date."
            values={{
              stationCount,
              componentName,
              startDate: (
                <FormattedDate
                  value={component.startedAt}
                  day="numeric"
                  month="long"
                  year="numeric"
                />
              ),
              issueTypeCountString,
            }}
          />
        </span>
      )}

      <div className="mt-6 grid grid-cols-1 gap-x-24 gap-y-16 sm:grid-cols-2 md:grid-cols-3">
        {Object.entries(component.branches).map(([branchCode, branch]) => (
          <div key={branchCode} className="flex flex-col">
            <div className="flex items-center gap-x-2">
              <h2 className="font-bold text-gray-800 text-lg leading-tight dark:text-gray-100">
                {branch.title_translations[intl.locale] ?? branch.title}
              </h2>

              <div className="rounded bg-gray-300 px-2 py-0.5 text-gray-500 text-xs dark:bg-gray-700 dark:text-gray-400">
                {branch.startedAt == null ? (
                  <FormattedMessage
                    id="status.not_in_service"
                    defaultMessage="Not in Service"
                  />
                ) : (
                  <>
                    {branch.endedAt == null ? (
                      <FormattedMessage
                        id="general.opened"
                        defaultMessage="Opened"
                      />
                    ) : (
                      <FormattedMessage
                        id="general.closed"
                        defaultMessage="Closed"
                      />
                    )}
                  </>
                )}
              </div>
            </div>

            <div className="mt-1.5 grid grid-flow-row grid-cols-[auto_1fr] gap-x-2">
              {branch.stationCodes.map((branchStationCode, index) => (
                <Fragment key={branchStationCode}>
                  <div className="relative flex h-8 items-center gap-y-1">
                    <div
                      className="z-20 size-4 rounded-full border-4 bg-white"
                      style={{
                        borderColor: component.color,
                      }}
                    />
                    <div
                      className={classNames(
                        '-translate-x-1/2 absolute left-1/2 z-10 flex',
                        {
                          'top-1/2 bottom-0': index === 0,
                          'top-0 bottom-1/2':
                            index === branch.stationCodes.length - 1,
                          'top-0 bottom-0':
                            index > 0 && index < branch.stationCodes.length - 1,
                        },
                      )}
                    >
                      <div
                        className="w-1 grow"
                        style={{
                          backgroundColor: component.color,
                        }}
                      />
                    </div>
                  </div>
                  <div className="relative flex items-center gap-x-1.5">
                    <div className="flex items-center overflow-hidden rounded-md">
                      {Object.entries(
                        stationsByCode[branchStationCode].componentMembers,
                      )
                        .sort((a, b) => {
                          if (a[0] === componentId) {
                            return -1;
                          }
                          if (b[0] === componentId) {
                            return 1;
                          }
                          return 0;
                        })
                        .map(([componentId, componentMembers]) => (
                          <Fragment key={componentId}>
                            {componentMembers.map((member) => (
                              <div
                                key={member.code}
                                className="z-10 flex h-4 w-10 items-center justify-center px-1.5"
                                style={{
                                  backgroundColor:
                                    componentsById[componentId].color,
                                }}
                              >
                                <span className="font-semibold text-white text-xs leading-none">
                                  {member.code}
                                </span>
                              </div>
                            ))}
                          </Fragment>
                        ))}
                    </div>
                    <div className="flex">
                      <Link
                        to={buildLocaleAwareLink(
                          `/stations/${stationsByCode[branchStationCode].id}`,
                          intl.locale,
                        )}
                        className="group flex"
                      >
                        <span className="text-gray-800 text-sm group-hover:underline dark:text-gray-200">
                          {stationsByCode[branchStationCode].name_translations[
                            intl.locale
                          ] ?? stationsByCode[branchStationCode].name}
                        </span>
                      </Link>
                    </div>
                  </div>
                </Fragment>
              ))}
            </div>
          </div>
        ))}
      </div>

      <h2 className="mt-4 font-bold text-gray-800 text-lg dark:text-gray-100">
        <FormattedMessage
          id="general.issues_with_count"
          defaultMessage="Issues ({count})"
          values={{
            count: issueRefs.length,
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

export default ComponentPage;
