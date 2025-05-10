import type { Issue } from '../types';
import { IssueViewer } from '../components/IssueViewer';
import { IssueSkeleton } from '../components/IssueSkeleton';

import type { Route } from './+types/($lang).issues.$issueId';
import { assert } from '../util/assert';
import { createIntl } from 'react-intl';
import { countIssueStations } from '~/helpers/countIssueStations';

export async function loader({ params, context }: Route.LoaderArgs) {
  const rootUrl = context.cloudflare.env.CF_PAGES_URL;

  const { issueId, lang = 'en-SG' } = params;

  const res = await fetch(
    `https://data.mrtdown.foldaway.space/source/issue/${issueId}.json`,
  );
  assert(res.ok, res.statusText);
  const issue: Issue = await res.json();

  const title = `${issue.title} | mrtdown`;

  const { default: messages } = await import(`../../lang/${lang}.json`);

  const intl = createIntl({
    locale: lang,
    messages,
  });

  const description = intl.formatMessage(
    {
      id: 'issue.description',
      defaultMessage:
        'This issue affected {stationCount, plural, one { {stationCount} {lineNames} station } other { {stationCount} {lineNames} stations }} on {period}.',
    },
    {
      stationCount: countIssueStations(issue),
      lineNames: intl.formatList(issue.componentIdsAffected),
      period:
        issue.endAt != null
          ? intl.formatDateTimeRange(issue.startAt, issue.endAt, {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
              hour: 'numeric',
              minute: 'numeric',
            })
          : intl.formatMessage(
              {
                id: 'general.ongoing_timestamp',
                defaultMessage:
                  '{start, date, medium} {start, time, short} to present',
              },
              {
                start: issue.startAt,
              },
            ),
    },
  );

  return {
    issue,
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
        mainEntity: {
          '@type': 'Event',
          name: issue.title,
          eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
          startDate: issue.startAt,
          endDate: issue.endAt,
        },
        url: ogUrl,
        image: ogImage,
      },
    },
  ];
};

// HydrateFallback is rendered while the client loader is running
export function HydrateFallback() {
  return <IssueSkeleton />;
}

const IssuePage: React.FC<Route.ComponentProps> = (props) => {
  const { loaderData } = props;
  const { issue } = loaderData;

  return (
    <div className="flex flex-col">
      <IssueViewer issue={issue} />
    </div>
  );
};

export default IssuePage;
