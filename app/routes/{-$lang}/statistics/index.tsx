import { createFileRoute } from '@tanstack/react-router';
import { createIntl, FormattedMessage } from 'react-intl';
import { IncludedEntitiesContext } from '~/contexts/IncludedEntities';
import { getStatisticsFn } from '~/util/statistics.functions';
import { StatisticsGrid } from './components/StatisticsGrid';

export const Route = createFileRoute('/{-$lang}/statistics/')({
  component: StatisticsPage,
  loader: () => getStatisticsFn(),
  async head(ctx) {
    const { lang = 'en-SG' } = ctx.params;
    const { default: messages } = await import(`../../../../lang/${lang}.json`);

    const rootUrl = import.meta.env.VITE_ROOT_URL;

    const ogUrl = new URL(location.pathname, rootUrl).toString();
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
