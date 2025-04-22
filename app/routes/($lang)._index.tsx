import { DateTime } from 'luxon';
import { useMemo } from 'react';
import type { MetaFunction } from 'react-router';
import { ComponentOutlook } from '../components/ComponentOutlook';
import { computeComponentBreakdown } from '../components/ComponentOutlook/helpers/computeComponentBreakdowns';
import { IssueViewer } from '../components/IssueViewer';
import { patchDatesForOngoingIssues } from '../helpers/patchDatesForOngoingIssues';
import { useViewport } from '../hooks/useViewport';
import type { Overview } from '../types';

import { assert } from '../util/assert';
import type { Route } from './+types/($lang)._index';
import { StatusBanner } from '~/components/StatusBanner';

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
      title: 'mrtdown',
    },
  ];
};

const HomePage: React.FC<Route.ComponentProps> = (props) => {
  const { loaderData } = props;

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

  const componentBreakdowns = useMemo(() => {
    return computeComponentBreakdown(loaderData);
  }, [loaderData]);

  return (
    <div className="flex flex-col">
      <div className="mb-3 flex flex-col">
        <StatusBanner hasOngoingIssues={loaderData.issuesOngoing.length > 0} />
      </div>

      {loaderData.issuesOngoing.map((issue) => (
        <IssueViewer key={issue.id} issue={issue} />
      ))}

      <div className="mt-5 flex flex-col gap-y-6">
        {componentBreakdowns.map((componentBreakdown) => (
          <ComponentOutlook
            key={componentBreakdown.component.id}
            breakdown={componentBreakdown}
            dateTimes={dateTimes}
          />
        ))}
      </div>
    </div>
  );
};

export default HomePage;
