import { patchDatesForOngoingIssues } from '../helpers/patchDatesForOngoingIssues';
import type { IssueStationEntry, Overview } from '../types';

import { useMemo } from 'react';
import { StationMap } from '~/components/StationMap';
import { assert } from '../util/assert';
import type { Route } from './+types/($lang).system-map';
import { StatusBanner } from '~/components/StatusBanner';
import { createIntl } from 'react-intl';

export async function loader({ params, context }: Route.LoaderArgs) {
  const rootUrl = context.cloudflare.env.CF_PAGES_URL;

  const res = await fetch(
    'https://data.mrtdown.foldaway.space/product/overview.json',
  );
  assert(res.ok, res.statusText);
  const overview: Overview = await res.json();
  patchDatesForOngoingIssues(overview.dates, overview.issuesOngoing);

  const { lang = 'en-SG' } = params;
  const { default: messages } = await import(`../../lang/${lang}.json`);

  const intl = createIntl({
    locale: lang,
    messages,
  });

  const title = `${intl.formatMessage({
    id: 'general.system_map',
    defaultMessage: 'System Map',
  })} | mrtdown`;

  return { overview, title, rootUrl };
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

  const { stationIdsAffected, componentIdsAffected } = useMemo(() => {
    const _stationIdsAffected: IssueStationEntry[] = [];
    const _componentIdsAffected = new Set<string>();

    for (const issue of loaderData.overview.issuesOngoing) {
      for (const componentId of issue.componentIdsAffected) {
        _componentIdsAffected.add(componentId);
      }
      for (const stationId of issue.stationIdsAffected) {
        _stationIdsAffected.push(stationId);
      }
    }

    return {
      stationIdsAffected: _stationIdsAffected,
      componentIdsAffected: Array.from(_componentIdsAffected),
    };
  }, [loaderData.overview.issuesOngoing]);

  return (
    <div className="flex flex-col gap-y-2">
      <StatusBanner
        hasOngoingIssues={loaderData.overview.issuesOngoing.length > 0}
      />

      <div className="flex flex-col bg-gray-200 p-4 dark:bg-gray-700">
        <StationMap
          stationIdsAffected={stationIdsAffected}
          componentIdsAffected={componentIdsAffected}
        />
      </div>
    </div>
  );
};

export default SystemMapPage;
