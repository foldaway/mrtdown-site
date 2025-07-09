import { DateTime } from 'luxon';
import { useMemo } from 'react';
import {
  createIntl,
  FormattedDate,
  FormattedMessage,
  useIntl,
} from 'react-intl';
import { ComponentOutlook } from '~/components/ComponentOutlook';
import type { ComponentBreakdown } from '~/components/ComponentOutlook/helpers/computeComponentBreakdowns';
import { IssueRefViewer } from '~/components/IssuesHistoryPageViewer/components/IssueRefViewer';
import { CountTrendCards } from '~/components/StatisticsGrid/components/CountTrendCards';
import { LastMajorDisruption } from '~/components/status/LastMajorDisruption';
import { ReliabilityTrend } from '~/components/status/ReliabilityTrend';
import { Summary } from '~/components/status/Summary';
import {
  buildIssueTypeCountString,
  buildIssueTypeCountStringWithArray,
} from '~/helpers/buildIssueTypeCountString';
import { computeIssueIntervals } from '~/helpers/computeIssueIntervals';
import { patchDatesForOngoingIssues } from '~/helpers/patchDatesForOngoingIssues';
import { useViewport } from '~/hooks/useViewport';
import type { ComponentStatusManifest, IssueRef } from '~/types';
import { assert } from '~/util/assert';
import type { Route } from './+types/($lang).status.$lineId';

export async function loader({ params, context }: Route.LoaderArgs) {
  const { lineId, lang = 'en-SG' } = params;

  const rootUrl = context.cloudflare.env.ROOT_URL;

  const res = await fetch(
    `https://data.mrtdown.foldaway.space/product/component_status_${lineId}.json`,
  );
  assert(res.ok, res.statusText);

  const componentStatusManifest: ComponentStatusManifest = await res.json();
  const component = componentStatusManifest.componentsById[lineId];

  patchDatesForOngoingIssues(
    componentStatusManifest.dates,
    componentStatusManifest.issuesOngoingSnapshot,
  );

  const stationIds = new Set<string>();
  for (const station of Object.values(componentStatusManifest.stationsByCode)) {
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
  const title = intl.formatMessage(
    {
      id: 'general.component_status.title',
      defaultMessage: '{componentName} down? Current Service Status & Problems',
    },
    {
      componentName,
    },
  );

  const issueTypeCountString = buildIssueTypeCountString(
    componentStatusManifest.issueCountByType,
    intl,
  );

  const stationCount = stationIds.size;
  let interchangeNames: string[] = [];
  {
    const result: string[] = [];

    for (const station of Object.values(
      componentStatusManifest.stationsByCode,
    )) {
      let stationCodeCount = 0;
      for (const members of Object.values(station.componentMembers)) {
        stationCodeCount += members.length;
      }

      if (stationCodeCount <= 1) {
        continue;
      }

      const stationName =
        station.name_translations[intl.locale] ?? station.name;
      result.push(stationName);
    }

    if (result.length <= 3) {
      interchangeNames = result;
    } else {
      const stepCount = Math.ceil(result.length / 3);

      for (let i = 0; i < result.length; i += stepCount) {
        interchangeNames.push(result[i]);
      }
    }
  }

  const description = intl.formatMessage(
    {
      id: 'general.component_status.description',
      defaultMessage:
        'The {componentName} connects key interchanges like {interchangeNames}. Official updates indicate {issueTypeCountString}.',
    },
    {
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
      interchangeNames: intl.formatList(interchangeNames),
      issueTypeCountString,
    },
  );

  return {
    title,
    description,
    componentStatusManifest,
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
  const { title, description, componentStatusManifest, rootUrl } = data;
  const { componentId, componentsById, stationsByCode } =
    componentStatusManifest;
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

const ComponentStatusPage: React.FC<Route.ComponentProps> = (props) => {
  const { loaderData } = props;
  const { componentStatusManifest } = loaderData;

  const intl = useIntl();

  const {
    componentId,
    componentsById,
    stationsByCode,
    dates,
    issuesOngoingSnapshot,
    issuesRecent,
    lastMajorDisruption,
  } = componentStatusManifest;
  const component = componentsById[componentId];
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
    return buildIssueTypeCountStringWithArray(issuesOngoingSnapshot, intl);
  }, [issuesOngoingSnapshot, intl]);

  const viewport = useViewport();
  const dateCount = useMemo<number>(() => {
    switch (viewport) {
      case 'xs': {
        return 30;
      }
      case 'sm':
      case 'md': {
        return 60;
      }
      default: {
        return 90;
      }
    }
  }, [viewport]);

  const dateTimes = useMemo(() => {
    const dateRangeEnd = DateTime.now()
      .startOf('hour')
      .setZone('Asia/Singapore');
    const results: DateTime[] = [];
    for (let i = 0; i < dateCount; i++) {
      results.unshift(dateRangeEnd.minus({ days: i }));
    }
    return results;
  }, [dateCount]);

  const issuesOngoingFiltered = useMemo(() => {
    const now = DateTime.now();

    const result: IssueRef[] = [];
    for (const issue of issuesOngoingSnapshot) {
      const intervals = computeIssueIntervals(issue);

      if (!intervals.some((interval) => interval.contains(now))) {
        continue;
      }

      result.push(issue);
    }

    return result;
  }, [issuesOngoingSnapshot]);

  const componentBreakdown = useMemo<ComponentBreakdown>(() => {
    return {
      component,
      dates,
      issuesOngoing: issuesOngoingFiltered,
    };
  }, [dates, component, issuesOngoingFiltered]);

  const interchangeNames = useMemo(() => {
    const result: string[] = [];

    for (const station of Object.values(stationsByCode)) {
      let stationCodeCount = 0;
      for (const members of Object.values(station.componentMembers)) {
        stationCodeCount += members.length;
      }

      if (stationCodeCount <= 1) {
        continue;
      }

      const stationName =
        station.name_translations[intl.locale] ?? station.name;
      result.push(stationName);
    }

    if (result.length <= 3) {
      return result;
    }

    const stepCount = Math.ceil(result.length / 3);
    const newResult: string[] = [];

    for (let i = 0; i < result.length; i += stepCount) {
      newResult.push(result[i]);
    }

    return newResult;
  }, [stationsByCode, intl]);

  return (
    <div className="flex flex-col">
      <h1 className="font-bold text-gray-800 text-xl dark:text-gray-100">
        <FormattedMessage
          id="general.component_status.heading"
          defaultMessage="{componentName} outages in the last {dateCount} days"
          values={{ componentName, dateCount }}
        />
      </h1>

      <span className="mt-1 mb-2 text-gray-600 text-sm dark:text-gray-400">
        <FormattedMessage
          id="general.component_status.description"
          defaultMessage="The {componentName} connects key interchanges like {interchangeNames}. Official updates indicate {issueTypeCountString}."
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
            interchangeNames: intl.formatList(interchangeNames),
            issueTypeCountString,
          }}
        />
      </span>

      <ComponentOutlook breakdown={componentBreakdown} dateTimes={dateTimes} />

      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Summary
          component={component}
          dates={dates}
          issuesOngoing={issuesOngoingFiltered}
        />
        <LastMajorDisruption issueRef={lastMajorDisruption} />
        <ReliabilityTrend dates={dates} />
      </div>

      <div className="mt-4 flex flex-col text-gray-800 dark:text-gray-100">
        <CountTrendCards dates={dates} />
      </div>

      <h2 className="mt-4 font-bold text-gray-800 text-lg dark:text-gray-100">
        <FormattedMessage
          id="general.component_status.recent_issues"
          defaultMessage="Recent issues"
        />
      </h2>

      <div className="mt-2 flex flex-col gap-y-2">
        {issuesRecent.map((issueRef) => (
          <IssueRefViewer key={issueRef.id} issueRef={issueRef} />
        ))}
      </div>
    </div>
  );
};

export default ComponentStatusPage;
