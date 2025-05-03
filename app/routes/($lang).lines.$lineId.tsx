import type { ComponentManifest } from '~/types';
import { assert } from '../util/assert';
import type { Route } from './+types/($lang).lines.$lineId';
import {
  createIntl,
  FormattedDate,
  FormattedMessage,
  useIntl,
} from 'react-intl';
import { Fragment, useMemo } from 'react';
import classNames from 'classnames';
import { Link } from 'react-router';
import { buildLocaleAwareLink } from '~/helpers/buildLocaleAwareLink';
import { DateTime } from 'luxon';

export async function loader({ params, context }: Route.LoaderArgs) {
  const { lineId, lang = 'en-SG' } = params;

  const rootUrl = context.cloudflare.env.CF_PAGES_URL;

  const res = await fetch(
    `https://data.mrtdown.foldaway.space/product/component_${lineId}.json`,
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
  const title = `${componentName} | mrtdown`;

  const description = intl.formatMessage(
    {
      id: 'general.component_description',
      defaultMessage:
        'The {componentName} began operations on {startDate}. It currently has {stationCount, plural, one {# station} other {# stations}}.',
    },
    {
      stationCount: stationIds.size,
      componentName,
      startDate: intl.formatDate(component.startedAt, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }),
    },
  );

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
  const { componentId, componentsById, stationsByCode } = componentManifest;

  const component = componentsById[componentId];

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

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-x-2">
        <span
          className="rounded-sm px-2 py-0.5 font-semibold text-white text-xs"
          style={{ backgroundColor: component.color }}
        >
          {component.id}
        </span>
        <span className="font-bold text-gray-800 text-xl dark:text-gray-100">
          {componentName}
        </span>
      </div>

      {DateTime.fromISO(component.startedAt).diffNow().as('days') < 0 && (
        <span className="mt-1 text-gray-600 text-sm dark:text-gray-400">
          <FormattedMessage
            id="general.component_description"
            defaultMessage="The {componentName} began operations on {startDate}. It currently has {stationCount, plural, one {# station} other {# stations}}."
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
            }}
          />
        </span>
      )}

      <div className="mt-6 flex flex-col gap-y-16">
        {Object.entries(component.branches).map(([branchCode, branch]) => (
          <div key={branchCode} className="flex flex-col">
            <div className="flex items-center gap-x-2">
              <h2 className="font-bold text-gray-800 text-lg dark:text-gray-100">
                {branch.title_translations[intl.locale] ?? branch.title}
              </h2>

              <div className="rounded bg-gray-300 px-2 py-1 text-gray-500 text-xs dark:bg-gray-700 dark:text-gray-400">
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

            <div className="grid grid-cols-3 justify-between gap-y-4 sm:px-12 md:grid-cols-6 lg:grid-cols-12 lg:px-8">
              {branch.stationCodes.map((branchStationCode, index) => (
                <div key={branchStationCode} className="flex flex-col">
                  <div
                    className={classNames(
                      'relative flex flex-col items-center justify-end',
                      {
                        'h-16 sm:h-32': intl.locale !== 'zh-Hans',
                        'h-16 sm:h-12': intl.locale === 'zh-Hans',
                      },
                    )}
                  >
                    <div
                      className={classNames('mb-2 flex transition-transform', {
                        'sm:-rotate-45': intl.locale !== 'zh-Hans',
                      })}
                      style={{
                        transformOrigin: 'center bottom',
                      }}
                    >
                      <Link
                        to={buildLocaleAwareLink(
                          `/stations/${stationsByCode[branchStationCode].id}`,
                          intl.locale,
                        )}
                        className="group flex"
                      >
                        <span
                          className={classNames(
                            'text-center text-gray-800 text-sm group-hover:underline sm:text-xs dark:text-gray-200',
                            {
                              'sm:[writing-mode:vertical-lr]':
                                intl.locale !== 'zh-Hans',
                            },
                          )}
                        >
                          {stationsByCode[branchStationCode].name_translations[
                            intl.locale
                          ] ?? stationsByCode[branchStationCode].name}
                        </span>
                      </Link>
                    </div>
                  </div>
                  <div className="relative row-start-2 row-end-2 flex flex-col items-center gap-y-1">
                    <div
                      className={classNames(
                        'absolute top-0 flex h-4 items-center',
                        {
                          'right-0 left-1/2': index === 0,
                          'right-1/2 left-0':
                            index === branch.stationCodes.length - 1,
                          'right-0 left-0':
                            index > 0 && index < branch.stationCodes.length - 1,
                        },
                      )}
                    >
                      <div
                        className="h-1 grow"
                        style={{
                          backgroundColor: component.color,
                        }}
                      />
                    </div>
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
                              className="z-10 flex h-4 items-center rounded-md px-1.5"
                              style={{
                                backgroundColor:
                                  componentsById[componentId].color,
                              }}
                            >
                              <span className="font-semibold text-white text-xs">
                                {member.code}
                              </span>
                            </div>
                          ))}
                        </Fragment>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ComponentPage;
