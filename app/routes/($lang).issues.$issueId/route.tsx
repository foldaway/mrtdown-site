import {
  BuildingOfficeIcon,
  CogIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/16/solid';
import classNames from 'classnames';
import { createIntl, FormattedMessage, useIntl } from 'react-intl';
import { getIssuesIssueId } from '~/client';
import { IssueTypeLabels } from '~/constants';
import { IncludedEntitiesContext } from '~/contexts/IncludedEntities';
import { assert } from '../../util/assert';
import type { Route } from './+types/route';
import { Attributes } from './components/Attributes';
import { StatsCard } from './components/StatsCard';
import { TimelineCard } from './components/TimelineCard';

export async function loader({ params }: Route.LoaderArgs) {
  const rootUrl = process.env.ROOT_URL;

  const { issueId, lang = 'en-SG' } = params;

  const { data, error, response } = await getIssuesIssueId({
    auth: () => process.env.API_TOKEN,
    baseUrl: process.env.API_ENDPOINT,
    path: {
      issueId,
    },
  });
  if (error != null) {
    console.error('Error fetching issue:', error);
    throw new Response('Failed to fetch issue', {
      status: response.status,
      statusText: response.statusText,
    });
  }
  assert(data != null);
  const { included } = data;
  const { updates } = data.data;
  const issue = included.issues[issueId];

  const title = issue.titleTranslations[lang] ?? issue.title;

  const { default: messages } = await import(`../../../lang/${lang}.json`);

  const intl = createIntl({
    locale: lang,
    messages,
  });

  const stationIds = new Set<string>();
  for (const branch of issue.branchesAffected) {
    for (const stationId of branch.stationIds) {
      stationIds.add(stationId);
    }
  }
  const stationCount = stationIds.size;
  const lineNames = issue.lineIds.map((lineId) => {
    const line = included.lines[lineId];
    return line.titleTranslations[lang] ?? line.title;
  });

  const description = intl.formatMessage(
    {
      id: 'issue.description',
      defaultMessage:
        'This issue affected {stationCount, plural, one { {stationCount} {lineNames} station } other { {stationCount} {lineNames} stations }} on {period}.',
    },
    {
      stationCount,
      lineNames,
      period: 'WIP',
    },
  );

  return {
    issue,
    updates,
    included,
    title,
    description,
    rootUrl,
  };
}

export function headers() {
  return {
    'Cache-Control': 'max-age=60, s-maxage=60',
  };
}

export const meta: Route.MetaFunction = ({ data, location }) => {
  const { issue, title, description, rootUrl } = data;

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
      property: 'og:description',
      content: description,
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
    {
      'script:ld+json': {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: title,
        mainEntity: issue.intervals.map((interval) => {
          return {
            '@type': 'Event',
            name: issue.title,
            eventAttendanceMode:
              'https://schema.org/OfflineEventAttendanceMode',
            startDate: interval.startAt,
            endDate: interval.endAt,
            location: 'Singapore Public Transport',
          };
        }),
        url: ogUrl,
        image: ogImage,
      },
    },
  ];
};

const IssuePage: React.FC<Route.ComponentProps> = (props) => {
  const { loaderData } = props;
  const { issue, updates, included } = loaderData;

  const intl = useIntl();

  return (
    <IncludedEntitiesContext.Provider value={included}>
      <div className="flex flex-col gap-y-4">
        {/*<IssueViewer issue={issue} />*/}

        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6 dark:border-gray-700 dark:bg-gray-800">
          <div className="flex items-center gap-x-2">
            <div
              className={classNames(
                'flex size-7 items-center justify-center rounded-full shadow-sm',
                {
                  'bg-disruption-light/20 ring-2 ring-disruption-light/30 dark:bg-disruption-dark/30 dark:ring-disruption-dark/50':
                    issue.type === 'disruption',
                  'bg-maintenance-light/20 ring-2 ring-maintenance-light/30 dark:bg-maintenance-dark/30 dark:ring-maintenance-dark/50':
                    issue.type === 'maintenance',
                  'bg-infra-light/20 ring-2 ring-infra-light/30 dark:bg-infra-dark/30 dark:ring-infra-dark/50':
                    issue.type === 'infra',
                },
              )}
            >
              {issue.type === 'disruption' && (
                <ExclamationTriangleIcon className="size-4 shrink-0 text-disruption-light dark:text-disruption-dark" />
              )}
              {issue.type === 'maintenance' && (
                <CogIcon className="size-4 shrink-0 text-maintenance-light dark:text-maintenance-dark" />
              )}
              {issue.type === 'infra' && (
                <BuildingOfficeIcon className="size-4 shrink-0 text-infra-light dark:text-infra-dark" />
              )}
            </div>
            <span
              className={classNames('font-medium text-sm', {
                'text-disruption-light dark:text-disruption-dark':
                  issue.type === 'disruption',
                'text-maintenance-light dark:text-maintenance-dark':
                  issue.type === 'maintenance',
                'text-infra-light dark:text-infra-dark': issue.type === 'infra',
              })}
            >
              <FormattedMessage {...IssueTypeLabels[issue.type]} />
            </span>
          </div>

          <h1 className="mt-3 font-bold text-2xl text-gray-900 dark:text-gray-100">
            {issue.titleTranslations[intl.locale] ?? issue.title}
          </h1>

          <Attributes issue={issue} />
        </div>

        <TimelineCard updates={updates} />

        <StatsCard issue={issue} />
      </div>
    </IncludedEntitiesContext.Provider>
  );
};

export default IssuePage;
