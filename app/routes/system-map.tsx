import type { Overview, Statistics } from '../types';
import { StatisticsGrid } from '../components/StatisticsGrid';
import { patchDatesForOngoingIssues } from '../helpers/patchDatesForOngoingIssues';
import type { MetaFunction } from 'react-router';

import type { Route } from './+types/statistics';
import { assert } from '../util/assert';
import { StationMap } from '~/components/StationMap';
import { useMemo } from 'react';

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
    <div className="flex flex-col">
      <StationMap
        stationIdsAffected={stationIdsAffected}
        componentIdsAffected={componentIdsAffected}
      />
    </div>
  );
};

export default SystemMapPage;
