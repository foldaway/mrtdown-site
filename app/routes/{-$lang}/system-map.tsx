import { createFileRoute, Link } from '@tanstack/react-router';
import { DateTime } from 'luxon';
import { useMemo } from 'react';
import { createIntl, FormattedMessage, useIntl } from 'react-intl';
import type { Issue, IssueAffectedBranch } from '~/types';
import { CurrentAdvisoriesSection } from '~/components/CurrentAdvisoriesSection';
import { countOperationalLineSummaries } from '~/components/CurrentAdvisoriesSection/helpers';
import {
  StationMap,
  type StationMapSnapshotComponents,
} from '~/components/StationMap';
import { MapApr2025 } from '~/components/StationMap/components/MapApr2025';
import { MapDec2019 } from '~/components/StationMap/components/MapDec2019';
import { MapDec2027 } from '~/components/StationMap/components/MapDec2027';
import { MapDec2029 } from '~/components/StationMap/components/MapDec2029';
import { MapDec2030 } from '~/components/StationMap/components/MapDec2030';
import { MapDec2032 } from '~/components/StationMap/components/MapDec2032';
import { MapJan2012 } from '~/components/StationMap/components/MapJan2012';
import { MapNov2017 } from '~/components/StationMap/components/MapNov2017';
import { MapNov2024 } from '~/components/StationMap/components/MapNov2024';
import { IncludedEntitiesContext } from '~/contexts/IncludedEntities';
import { getLocalizedTranslation } from '~/helpers/getLocalizedTranslation';
import { buildSeoMetadata } from '~/helpers/seo';
import { getSystemMapFn } from '~/util/system-map.functions';

const SYSTEM_MAP_SNAPSHOTS = {
  '2012-01': MapJan2012,
  '2017-11': MapNov2017,
  '2019-12': MapDec2019,
  '2024-11': MapNov2024,
  '2025-04': MapApr2025,
  '2027-12': MapDec2027,
  '2029-12': MapDec2029,
  '2030-12': MapDec2030,
  '2032-12': MapDec2032,
} satisfies StationMapSnapshotComponents;

export const Route = createFileRoute('/{-$lang}/system-map')({
  component: SystemMapPage,
  loader: () => getSystemMapFn(),
  async head(ctx) {
    const { lang = 'en-SG' } = ctx.params;
    const { default: messages } = await import(`../../../lang/${lang}.json`);

    const rootUrl = import.meta.env.VITE_ROOT_URL;

    const seo = buildSeoMetadata({ path: '/system-map', rootUrl });

    const intl = createIntl({
      locale: lang,
      messages,
    });

    const title = intl.formatMessage({
      id: 'general.system_map',
      defaultMessage: 'System Map',
    });
    const description = intl.formatMessage({
      id: 'site.system_map.subtitle',
      defaultMessage:
        "Real-time status and network overview of Singapore's MRT and LRT system",
    });

    return {
      links: seo.links,
      meta: [
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
          content: seo.ogUrl,
        },
        {
          property: 'og:image',
          content: seo.ogImage,
        },
      ],
    };
  },
});

function SystemMapPage() {
  const loaderData = Route.useLoaderData();
  const { overview, included } = loaderData;

  const intl = useIntl();

  const issuesActiveNow = useMemo(() => {
    return overview.issueIdsActiveNow
      .map((issueId) => included.issues[issueId])
      .filter((issue): issue is Issue => issue != null);
  }, [overview.issueIdsActiveNow, included.issues]);

  const issuesActiveToday = useMemo(() => {
    return overview.issueIdsActiveToday
      .map((issueId) => included.issues[issueId])
      .filter((issue): issue is Issue => issue != null);
  }, [overview.issueIdsActiveToday, included.issues]);

  const lineOperationalCount = useMemo(() => {
    return countOperationalLineSummaries({
      lineSummaries: overview.lineSummaries,
    });
  }, [overview.lineSummaries]);

  const lines = useMemo(() => {
    return Object.values(included.lines);
  }, [included.lines]);

  const branchesAffected = useMemo(() => {
    const branches: IssueAffectedBranch[] = [];
    for (const issue of issuesActiveNow) {
      for (const branch of issue.branchesAffected) {
        branches.push(branch);
      }
    }
    for (const issue of issuesActiveToday) {
      for (const branch of issue.branchesAffected) {
        branches.push(branch);
      }
    }

    return branches;
  }, [issuesActiveNow, issuesActiveToday]);

  return (
    <IncludedEntitiesContext.Provider value={included}>
      <div className="flex flex-col space-y-8">
        <header className="space-y-2 text-center">
          <h1 className="font-bold text-2xl text-gray-900 leading-tight sm:text-3xl dark:text-gray-100">
            <FormattedMessage
              id="general.system_map"
              defaultMessage="System Map"
            />
          </h1>
          <p className="mx-auto max-w-2xl text-base text-gray-600 leading-normal dark:text-gray-400">
            <FormattedMessage
              id="site.system_map.subtitle"
              defaultMessage="Real-time status and network overview of Singapore's MRT and LRT system"
            />
          </p>
        </header>
        <CurrentAdvisoriesSection
          issuesActiveNow={issuesActiveNow}
          issuesActiveToday={issuesActiveToday}
          lineOperationalCount={lineOperationalCount}
        />

        <div className="flex flex-col bg-gray-100 p-4 dark:bg-gray-800">
          <StationMap
            currentDate={DateTime.now().toISODate()}
            snapshotComponents={SYSTEM_MAP_SNAPSHOTS}
            mode={{
              type: 'network',
              branchesAffected,
            }}
          />

          <div className="mt-2 flex bg-gray-50 px-4 py-2.5 dark:bg-gray-900">
            <div className="grid grow grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {lines.map((line) => (
                <Link
                  key={line.id}
                  className="group flex items-center gap-x-2 overflow-hidden"
                  to="/{-$lang}/lines/$lineId"
                  params={{ lineId: line.id }}
                >
                  <div
                    className="flex h-4 w-12 items-center justify-center rounded-md"
                    style={{
                      backgroundColor: line.color,
                    }}
                  >
                    <span className="font-semibold text-white text-xs">
                      {line.id}
                    </span>
                  </div>

                  <span className="text-gray-800 text-sm group-hover:underline dark:text-gray-200">
                    {getLocalizedTranslation(line.name, intl.locale)}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </IncludedEntitiesContext.Provider>
  );
}
