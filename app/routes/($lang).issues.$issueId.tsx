import type { Issue } from '../types';
import { IssueViewer } from '../components/IssueViewer';
import { IssueSkeleton } from '../components/IssueSkeleton';

import type { Route } from './+types/($lang).issues.$issueId';
import { assert } from '../util/assert';

export async function loader({ params, context }: Route.LoaderArgs) {
  const rootUrl = context.cloudflare.env.CF_PAGES_URL;

  const { issueId } = params;

  const res = await fetch(
    `https://data.mrtdown.foldaway.space/source/issue/${issueId}.json`,
  );
  assert(res.ok, res.statusText);
  const issue: Issue = await res.json();

  const title = `${issue.title} | mrtdown`;

  return {
    issue,
    title,
    rootUrl,
  };
}

export function headers() {
  return {
    'Cache-Control': 'max-age=60, s-maxage=60',
  };
}

export const meta: Route.MetaFunction = ({ data, location }) => {
  const { issue, title, rootUrl } = data;

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
