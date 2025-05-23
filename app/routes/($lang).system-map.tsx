import { patchDatesForOngoingIssues } from '../helpers/patchDatesForOngoingIssues';
import type { IssueStationEntry, Overview } from '../types';

import { DateTime } from 'luxon';
import { useMemo } from 'react';
import { createIntl, useIntl } from 'react-intl';
import { Link } from 'react-router';
import { StationMap } from '~/components/StationMap';
import { StatusBanner } from '~/components/StatusBanner';
import { buildLocaleAwareLink } from '~/helpers/buildLocaleAwareLink';
import { assert } from '../util/assert';
import type { Route } from './+types/($lang).system-map';

export async function loader({ params, context }: Route.LoaderArgs) {
  const rootUrl = context.cloudflare.env.ROOT_URL;

  const res = await fetch(
    'https://data.mrtdown.foldaway.space/product/overview.json',
  );
  assert(res.ok, res.statusText);
  const overview: Overview = await res.json();
  patchDatesForOngoingIssues(overview.dates, overview.issuesOngoingSnapshot);

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

  const intl = useIntl();

  const { stationIdsAffected, componentIdsAffected } = useMemo(() => {
    const _stationIdsAffected: IssueStationEntry[] = [];
    const _componentIdsAffected = new Set<string>();

    for (const issue of loaderData.overview.issuesOngoingSnapshot) {
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
  }, [loaderData.overview.issuesOngoingSnapshot]);

  return (
    <div className="flex flex-col gap-y-2">
      <StatusBanner issues={loaderData.overview.issuesOngoingSnapshot} />

      <div className="flex flex-col bg-gray-100 p-4 dark:bg-gray-800">
        <StationMap
          stationIdsAffected={stationIdsAffected}
          componentIdsAffected={componentIdsAffected}
          currentDate={DateTime.now().toISODate()}
        />

        <div className="mt-2 flex bg-gray-50 px-4 py-2.5 dark:bg-gray-900">
          <div className="grid grow grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {loaderData.overview.components
              .sort((a, b) => {
                if (a.id.endsWith('LRT')) {
                  return 1;
                }
                if (b.id.endsWith('LRT')) {
                  return -1;
                }
                return 0;
              })
              .map((component) => (
                <Link
                  key={component.id}
                  to={buildLocaleAwareLink(
                    `/lines/${component.id}`,
                    intl.locale,
                  )}
                  className="group flex items-center gap-x-2 overflow-hidden"
                >
                  <div
                    className="flex h-4 w-12 items-center justify-center rounded-md"
                    style={{
                      backgroundColor: component.color,
                    }}
                  >
                    <span className="font-semibold text-white text-xs">
                      {component.id}
                    </span>
                  </div>

                  <span className="text-gray-800 text-sm group-hover:underline dark:text-gray-200">
                    {component.title_translations[intl.locale] ??
                      component.title}
                  </span>
                </Link>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SystemMapPage;
