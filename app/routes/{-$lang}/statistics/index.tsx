import { createFileRoute } from '@tanstack/react-router';
import { createIntl, FormattedMessage } from 'react-intl';
import { IncludedEntitiesContext } from '~/contexts/IncludedEntities';
import { buildLocaleAwareLink } from '~/helpers/buildLocaleAwareLink';
import { getStatisticsFn } from '~/util/statistics.functions';
import { StatisticsGrid } from './components/StatisticsGrid';
import { StatisticsGridSkeleton } from './components/StatisticsGrid/components/StatisticsGridSkeleton';

export const Route = createFileRoute('/{-$lang}/statistics/')({
  component: StatisticsPage,
  pendingComponent: StatisticsPagePending,
  pendingMs: 0,
  pendingMinMs: 0,
  loader: () => getStatisticsFn(),
  async head(ctx) {
    const { lang = 'en-SG' } = ctx.params;
    const { default: messages } = await import(`../../../../lang/${lang}.json`);

    const rootUrl = import.meta.env.VITE_ROOT_URL;

    const ogUrl = new URL(
      buildLocaleAwareLink('/statistics', lang),
      rootUrl,
    ).toString();
    const ogImage = new URL('/og_image.png', rootUrl).toString();

    const intl = createIntl({
      locale: lang,
      messages,
    });

    const title = intl.formatMessage({
      id: 'general.statistics',
      defaultMessage: 'Statistics',
    });

    return {
      meta: [
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
      ],
    };
  },
});

function StatisticsPage() {
  const loaderData = Route.useLoaderData();

  return (
    <IncludedEntitiesContext.Provider value={loaderData.included}>
      <div className="flex flex-col space-y-8">
        <header className="space-y-2 text-center">
          <h1 className="font-bold text-2xl text-gray-900 leading-tight sm:text-3xl dark:text-gray-100">
            <FormattedMessage
              id="general.statistics"
              defaultMessage="Statistics"
            />
          </h1>
          <p className="mx-auto max-w-2xl text-base text-gray-600 leading-normal dark:text-gray-400">
            <FormattedMessage
              id="site.statistics.subtitle"
              defaultMessage="Historical performance data and analytics for Singapore's MRT and LRT network"
            />
          </p>
        </header>
        <StatisticsGrid statistics={loaderData.data} />
      </div>
    </IncludedEntitiesContext.Provider>
  );
}

function StatisticsPagePending() {
  return (
    <div className="flex flex-col space-y-8">
      <header className="space-y-2 text-center">
        <div className="mx-auto h-9 w-40 animate-pulse rounded-md bg-gray-200 dark:bg-gray-800" />
        <div className="mx-auto h-6 w-full max-w-2xl animate-pulse rounded-md bg-gray-200 dark:bg-gray-800" />
      </header>
      <StatisticsGridSkeleton />
    </div>
  );
}
