import type { Issue } from '../types';
import { IssueViewer } from '../components/IssueViewer';
import { IssueSkeleton } from '../components/IssueSkeleton';

import type { Route } from './+types/issues.$issueId';
import { assert } from '../util/assert';

export async function loader({ params }: Route.LoaderArgs) {
  const { issueId } = params;

  const res = await fetch(
    `https://data.mrtdown.foldaway.space/source/issue/${issueId}.json`,
  );
  assert(res.ok, res.statusText);
  const issue: Issue = await res.json();
  return issue;
}

export function headers() {
  return {
    'Cache-Control': 'max-age=60, s-maxage=60',
  };
}

export const meta: Route.MetaFunction = ({ data }) => {
  return [
    {
      title: `${data.title} | mrtdown`,
    },
  ];
};

// HydrateFallback is rendered while the client loader is running
export function HydrateFallback() {
  return <IssueSkeleton />;
}

const IssuePage: React.FC<Route.ComponentProps> = (props) => {
  const { loaderData } = props;

  return (
    <div className="flex flex-col">
      <IssueViewer issue={loaderData} />
    </div>
  );
};

export default IssuePage;
