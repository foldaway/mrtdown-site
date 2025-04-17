import type { MetaFunction } from 'react-router';
import { patchDatesForOngoingIssues } from '../helpers/patchDatesForOngoingIssues';
import type { Overview } from '../types';

import { useMemo } from 'react';
import { StationMap } from '~/components/StationMap';
import { assert } from '../util/assert';
import type { Route } from './+types/statistics';

export async function loader() {
  const res = await fetch(
    'https://data.mrtdown.foldaway.space/product/overview.json',
  );
  assert(res.ok, res.statusText);
  const overview: Overview = await res.json();
  patchDatesForOngoingIssues(overview.dates, overview.issuesOngoing);
  return overview;
}

export function headers() {
  return {
    'Cache-Control': 'max-age=60, s-maxage=60',
  };
}

export const meta: MetaFunction = () => {
  return [
    {
      title: 'Statistics | mrtdown',
    },
  ];
};

const SystemMapPage: React.FC<Route.ComponentProps> = (props) => {
  const { loaderData } = props;

  const { stationIdsAffected, componentIdsAffected } = useMemo(() => {
    const _stationIdsAffected = new Set<string>();
    const _componentIdsAffected = new Set<string>();

    for (const issue of loaderData.issuesOngoing) {
      for (const componentId of issue.componentIdsAffected) {
        _componentIdsAffected.add(componentId);
      }
      for (const stationId of issue.stationIdsAffected) {
        _stationIdsAffected.add(stationId);
      }
    }

    return {
      stationIdsAffected: Array.from(_stationIdsAffected),
      componentIdsAffected: Array.from(_componentIdsAffected),
    };
  }, [loaderData.issuesOngoing]);

  return (
    <div className="flex flex-col gap-y-2">
      <div className="flex flex-col bg-gray-200 p-4 dark:bg-gray-700">
        <StationMap
          stationIdsAffected={stationIdsAffected}
          componentIdsAffected={componentIdsAffected}
        />
      </div>

      <span className="text-gray-600 text-sm dark:text-gray-400">
        Among {loaderData.issuesOngoing.length} ongoing issues, there are{' '}
        {stationIdsAffected.length} affected stations and{' '}
        {componentIdsAffected.length} affected lines.
      </span>
    </div>
  );
};

export default SystemMapPage;
