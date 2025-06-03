import { DateTime } from 'luxon';
import { useMemo } from 'react';
import { ComponentOutlook } from '../components/ComponentOutlook';
import { computeComponentBreakdown } from '../components/ComponentOutlook/helpers/computeComponentBreakdowns';
import { patchDatesForOngoingIssues } from '../helpers/patchDatesForOngoingIssues';
import { useViewport } from '../hooks/useViewport';
import type { Overview } from '../types';

import { IssueRefViewer } from '~/components/IssuesHistoryPageViewer/components/IssueRefViewer';
import { StatusBanner } from '~/components/StatusBanner';
import { assert } from '../util/assert';
import type { Route } from './+types/($lang)._index';
import { FormattedMessage } from 'react-intl';

export async function loader({ context }: Route.LoaderArgs) {
  const rootUrl = context.cloudflare.env.ROOT_URL;

  const res = await fetch(
    'https://data.mrtdown.foldaway.space/product/overview.json',
  );
  assert(res.ok, res.statusText);
  const overview: Overview = await res.json();
  patchDatesForOngoingIssues(overview.dates, overview.issuesOngoingSnapshot);
  return {
    overview,
    rootUrl,
  };
}

export function headers() {
  return {
    'Cache-Control': 'max-age=60, s-maxage=60',
  };
}

export const meta: Route.MetaFunction = ({ data, location }) => {
  const { rootUrl } = data;

  const ogUrl = new URL(location.pathname, rootUrl).toString();
  const ogImage = new URL('/og_image.png', rootUrl).toString();

  return [
    {
      title: 'mrtdown',
    },
    {
      property: 'og:title',
      content: 'mrtdown',
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

const HomePage: React.FC<Route.ComponentProps> = (props) => {
  const { loaderData } = props;
  const { overview } = loaderData;

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
    return computeComponentBreakdown(overview);
  }, [overview]);

  return (
    <div className="flex flex-col">
      <div className="mb-3 flex flex-col">
        <StatusBanner issues={overview.issuesOngoingSnapshot} />
      </div>

      <div className="flex flex-col gap-y-2">
        {overview.issuesOngoingSnapshot.map((issue) => (
          <IssueRefViewer key={issue.id} issueRef={issue} />
        ))}
      </div>

      <div className="mt-5 flex flex-col gap-y-6">
        {componentBreakdowns.map((componentBreakdown) => (
          <ComponentOutlook
            key={componentBreakdown.component.id}
            breakdown={componentBreakdown}
            dateTimes={dateTimes}
          />
        ))}
      </div>

      <div className="mt-4 flex flex-col gap-x-5 gap-y-1 rounded-lg px-4 py-2 md:grid-cols-4 md:flex-row md:items-center">
        <div className="inline-flex items-center gap-x-1.5">
          <div className="size-4 rounded-sm bg-operational-light dark:bg-operational-dark" />
          <span className="text-gray-400 text-sm capitalize">
            <FormattedMessage
              id="status.operational"
              defaultMessage="Operational"
            />
          </span>
        </div>
        <div className="inline-flex items-center gap-x-1.5">
          <div className="size-4 rounded-sm bg-disruption-light dark:bg-disruption-dark" />
          <span className="text-gray-400 text-sm capitalize">
            <FormattedMessage
              id="general.disruption"
              defaultMessage="Disruption"
            />
          </span>
        </div>
        <div className="inline-flex items-center gap-x-1.5">
          <div className="size-4 rounded-sm bg-maintenance-light dark:bg-maintenance-dark" />
          <span className="text-gray-400 text-sm capitalize">
            <FormattedMessage
              id="general.maintenance"
              defaultMessage="Maintenance"
            />
          </span>
        </div>
        <div className="inline-flex items-center gap-x-1.5">
          <div className="size-4 rounded-sm bg-infra-light dark:bg-infra-dark" />
          <span className="text-gray-400 text-sm capitalize">
            <FormattedMessage
              id="general.infrastructure"
              defaultMessage="Infrastructure"
            />
          </span>
        </div>
        <div className="inline-flex items-center gap-x-1.5">
          <div className="size-4 shrink-0 rounded-sm bg-gray-400 dark:bg-gray-600" />
          <span className="text-gray-400 text-sm capitalize">
            <FormattedMessage
              id="status.service_ended"
              defaultMessage="Service Ended"
            />
            /
            <FormattedMessage
              id="status.not_in_service"
              defaultMessage="Not in Service"
            />
          </span>
        </div>
      </div>
    </div>
  );
};

export default HomePage;
