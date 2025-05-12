import type { Route } from './+types/($lang).stations.$stationId';
import { assert } from '../util/assert';
import type { StationIndex, StationManifest } from '~/types';
import {
  createIntl,
  FormattedDate,
  FormattedMessage,
  useIntl,
} from 'react-intl';
import { IssueRefViewer } from '~/components/IssuesHistoryPageViewer/components/IssueRefViewer';
import { Fragment, useMemo } from 'react';
import { DateTime } from 'luxon';
import { useHydrated } from '~/hooks/useHydrated';
import { Link } from 'react-router';
import { buildLocaleAwareLink } from '~/helpers/buildLocaleAwareLink';
import { StationBar } from '~/components/StationBar';
import type { SitemapFunction } from 'remix-sitemap';
import { LANGUAGES_NON_DEFAULT } from '~/constants';

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

  const { station } = stationManifest;

  const stationName = station.name_translations[lang] ?? station.name;

  const title = `${intl.formatMessage(
    {
      id: 'general.station_title',
      defaultMessage: '{stationName} Station',
    },
    { stationName },
  )} | mrtdown`;

  const stationCodes = new Set<string>();
  for (const members of Object.values(station.componentMembers)) {
    for (const member of members) {
      stationCodes.add(member.code);
    }
  }

  const description = intl.formatMessage(
    {
      id: 'general.station_description',
      defaultMessage:
        '{stationName} is served by {lines}, with station codes {stationCodes}.',
    },
    {
      stationName,
      lines: intl.formatList(
        Object.keys(stationManifest.station.componentMembers),
      ),
      stationCodes: intl.formatList(Array.from(stationCodes)),
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

export const sitemap: SitemapFunction = async ({ config }) => {
  const res = await fetch(
    'https://data.mrtdown.foldaway.space/product/station_index.json',
  );
  assert(res.ok, res.statusText);
  const stationIndex: StationIndex = await res.json();

  const result: ReturnType<SitemapFunction> = [];

  for (const stationId of stationIndex) {
    result.push({
      loc: `/stations/${stationId}`,
      alternateRefs: LANGUAGES_NON_DEFAULT.map((lang) => {
        return {
          href: new URL(`/${lang}`, config.siteUrl).toString(),
          hreflang: lang,
        };
      }),
    });
  }

  return result;
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
      <div className="flex items-center gap-x-1.5">
        <StationBar station={station} componentsById={componentsById} />
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
              Object.keys(stationManifest.station.componentMembers),
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
      <div className="mt-1 flex flex-col gap-y-2">
        {stationManifest.issueRefs.map((issueRef) => (
          <IssueRefViewer key={issueRef.id} issueRef={issueRef} />
        ))}
      </div>
    </div>
  );
};

export default StationPage;
