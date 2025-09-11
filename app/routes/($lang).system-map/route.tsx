import { DateTime } from 'luxon';
import { useMemo } from 'react';
import { createIntl, FormattedMessage, useIntl } from 'react-intl';
import { Link } from 'react-router';
import { getOverview, getStations, type IssueAffectedBranch } from '~/client';
import { CurrentAdvisoriesSection } from '~/components/CurrentAdvisoriesSection';
import { StationMap } from '~/components/StationMap';
import { IncludedEntitiesContext } from '~/contexts/IncludedEntities';
import { buildLocaleAwareLink } from '~/helpers/buildLocaleAwareLink';
import { assert } from '../../util/assert';
import type { Route } from './+types/route';

export async function loader({ params }: Route.LoaderArgs) {
  const rootUrl = process.env.ROOT_URL;

  const activeIssuesResponse = await getOverview({
    auth: () => process.env.API_TOKEN,
    baseUrl: process.env.API_ENDPOINT,
  });
  if (activeIssuesResponse.error != null) {
    console.error('Error fetching active issues:', activeIssuesResponse.error);
    throw new Response('Failed to fetch active issues', {
      status: 500,
      statusText: 'Internal Server Error',
    });
  }
  assert(activeIssuesResponse.data != null);

  const { data: overview } = activeIssuesResponse.data;

  const stationsResponse = await getStations({
    auth: () => process.env.API_TOKEN,
    baseUrl: process.env.API_ENDPOINT,
  });
  if (stationsResponse.error != null) {
    console.error('Error fetching stations:', stationsResponse.error);
    throw new Response('Failed to fetch stations', {
      status: 500,
      statusText: 'Internal Server Error',
    });
  }
  assert(stationsResponse.data != null);

  const { stationIds } = stationsResponse.data.data;

  const { lang = 'en-SG' } = params;
  const { default: messages } = await import(`../../../lang/${lang}.json`);

  const intl = createIntl({
    locale: lang,
    messages,
  });

  const title = intl.formatMessage({
    id: 'general.system_map',
    defaultMessage: 'System Map',
  });

  return {
    title,
    rootUrl,
    overview,
    stationIds,
    included: {
      issues: {
        ...activeIssuesResponse.data.included.issues,
        ...stationsResponse.data.included.issues,
      },
      landmarks: {
        ...activeIssuesResponse.data.included.landmarks,
        ...stationsResponse.data.included.landmarks,
      },
      lines: {
        ...activeIssuesResponse.data.included.lines,
        ...stationsResponse.data.included.lines,
      },
      stations: {
        ...activeIssuesResponse.data.included.stations,
        ...stationsResponse.data.included.stations,
      },
      towns: {
        ...activeIssuesResponse.data.included.towns,
        ...stationsResponse.data.included.towns,
      },
    },
  };
}

export function headers() {
  return {
    'Cache-Control': 'max-age=60, s-maxage=60',
  };
}

export const meta: Route.MetaFunction = ({ data, location }) => {
  const { title, rootUrl } = data;

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
      property: 'og:url',
      content: ogUrl,
    },
    {
      property: 'og:image',
      content: ogImage,
    },
  ];
};

const SystemMapPage: React.FC<Route.ComponentProps> = (props) => {
  const { loaderData } = props;
  const { overview, stationIds, included } = loaderData;

  const intl = useIntl();

  const issuesActiveNow = useMemo(() => {
    return overview.issueIdsActiveNow.map(
      (issueId) => included.issues[issueId],
    );
  }, [overview.issueIdsActiveNow, included.issues]);

  const issuesActiveToday = useMemo(() => {
    return overview.issueIdsActiveToday.map(
      (issueId) => included.issues[issueId],
    );
  }, [overview.issueIdsActiveToday, included.issues]);

  const lineOperationalCount = useMemo(() => {
    return overview.lineSummaries.filter((line) => line.status === 'normal')
      .length;
  }, [overview.lineSummaries]);

  const lines = useMemo(() => {
    return Object.values(included.lines);
  }, [included.lines]);

  const branchesAffected = useMemo(() => {
    const branches: IssueAffectedBranch[] = [];
    for (const issue of issuesActiveNow) {
      for (const branch of issue.branchesAffected) {
        branches.push(branch);
      }
    }
    for (const issue of issuesActiveToday) {
      for (const branch of issue.branchesAffected) {
        branches.push(branch);
      }
    }

    return branches;
  }, [issuesActiveNow, issuesActiveToday]);

  return (
    <IncludedEntitiesContext.Provider value={included}>
      <div className="flex flex-col space-y-8">
        <header className="space-y-2 text-center">
          <h1 className="font-bold text-2xl text-gray-900 leading-tight sm:text-3xl dark:text-gray-100">
            <FormattedMessage
              id="general.system_map"
              defaultMessage="System Map"
            />
          </h1>
          <p className="mx-auto max-w-2xl text-base text-gray-600 leading-normal dark:text-gray-400">
            <FormattedMessage
              id="site.system_map.subtitle"
              defaultMessage="Real-time status and network overview of Singapore's MRT and LRT system"
            />
          </p>
        </header>
        <CurrentAdvisoriesSection
          issuesActiveNow={issuesActiveNow}
          issuesActiveToday={issuesActiveToday}
          lineOperationalCount={lineOperationalCount}
        />

        <div className="flex flex-col bg-gray-100 p-4 dark:bg-gray-800">
          <StationMap
            branchesAffected={branchesAffected}
            currentDate={DateTime.now().toISODate()}
          />

          <div className="mt-2 flex bg-gray-50 px-4 py-2.5 dark:bg-gray-900">
            <div className="grid grow grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {lines.map((line) => (
                <Link
                  key={line.id}
                  to={buildLocaleAwareLink(`/lines/${line.id}`, intl.locale)}
                  className="group flex items-center gap-x-2 overflow-hidden"
                >
                  <div
                    className="flex h-4 w-12 items-center justify-center rounded-md"
                    style={{
                      backgroundColor: line.color,
                    }}
                  >
                    <span className="font-semibold text-white text-xs">
                      {line.id}
                    </span>
                  </div>

                  <span className="text-gray-800 text-sm group-hover:underline dark:text-gray-200">
                    {line.titleTranslations[intl.locale] ?? line.title}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </IncludedEntitiesContext.Provider>
  );
};

export default SystemMapPage;
