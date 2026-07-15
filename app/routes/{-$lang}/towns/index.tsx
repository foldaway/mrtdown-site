import { ArrowRightIcon } from '@heroicons/react/24/outline';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useMemo } from 'react';
import {
  createIntl,
  FormattedMessage,
  FormattedNumber,
  useIntl,
} from 'react-intl';
import { LineBar } from '~/components/LineBar';
import { IncludedEntitiesContext } from '~/contexts/IncludedEntities';
import { getLocalizedTranslation } from '~/helpers/getLocalizedTranslation';
import { buildLocalizedAbsoluteUrl, buildSeoMetadata } from '~/helpers/seo';
import { assert } from '~/util/assert';
import { getTownsFn } from '~/util/town.functions';

export const Route = createFileRoute('/{-$lang}/towns/')({
  component: TownsPage,
  loader: () => getTownsFn(),
  async head(ctx) {
    const lang = ctx.params.lang ?? 'en-SG';
    assert(ctx.loaderData != null);
    const { data, included } = ctx.loaderData;
    const { default: messages } = await import(`../../../../lang/${lang}.json`);
    const intl = createIntl({ locale: lang, messages });
    const rootUrl = import.meta.env.VITE_ROOT_URL;
    const seo = buildSeoMetadata({ lang, path: '/towns', rootUrl });
    const title = intl.formatMessage({
      id: 'towns.page_title',
      defaultMessage: 'Singapore MRT & LRT Stations by Town | mrtdown',
    });
    const description = intl.formatMessage(
      {
        id: 'towns.page_description',
        defaultMessage:
          'Explore MRT and LRT stations across {townCount} Singapore towns, with the lines serving each area and links to live station status.',
      },
      { townCount: data.towns.length },
    );
    const homeUrl = buildLocalizedAbsoluteUrl('/', lang, rootUrl);

    return {
      links: seo.links,
      meta: [
        { title },
        { name: 'description', content: description },
        { property: 'og:title', content: title },
        { property: 'og:description', content: description },
        { property: 'og:type', content: 'website' },
        { property: 'og:url', content: seo.ogUrl },
        { property: 'og:image', content: seo.ogImage },
        {
          'script:ld+json': {
            '@context': 'https://schema.org',
            '@graph': [
              {
                '@type': 'CollectionPage',
                name: title,
                description,
                url: seo.ogUrl,
                inLanguage: lang,
                mainEntity: {
                  '@type': 'ItemList',
                  numberOfItems: data.towns.length,
                  itemListElement: data.towns.map((summary, index) => ({
                    '@type': 'ListItem',
                    position: index + 1,
                    name: getLocalizedTranslation(
                      included.towns[summary.townId].name,
                      lang,
                    ),
                    url: buildLocalizedAbsoluteUrl(
                      `/towns/${summary.townId}`,
                      lang,
                      rootUrl,
                    ),
                  })),
                },
              },
              {
                '@type': 'BreadcrumbList',
                itemListElement: [
                  {
                    '@type': 'ListItem',
                    position: 1,
                    name: intl.formatMessage({
                      id: 'general.home',
                      defaultMessage: 'Home',
                    }),
                    item: homeUrl,
                  },
                  {
                    '@type': 'ListItem',
                    position: 2,
                    name: intl.formatMessage({
                      id: 'general.towns',
                      defaultMessage: 'Towns',
                    }),
                    item: seo.ogUrl,
                  },
                ],
              },
            ],
          },
        },
      ],
    };
  },
});

function TownsPage() {
  const { data, included } = Route.useLoaderData();
  const intl = useIntl();
  const summaries = useMemo(
    () =>
      [...data.towns].sort((a, b) =>
        getLocalizedTranslation(
          included.towns[a.townId].name,
          intl.locale,
        ).localeCompare(
          getLocalizedTranslation(included.towns[b.townId].name, intl.locale),
          intl.locale,
        ),
      ),
    [data.towns, included.towns, intl.locale],
  );
  const stationCount = new Set(data.towns.flatMap((town) => town.stationIds))
    .size;

  return (
    <IncludedEntitiesContext.Provider value={included}>
      <div className="flex flex-col space-y-5 sm:space-y-7">
        <header className="flex flex-col items-center gap-1 text-center">
          <h1 className="font-bold text-gray-900 text-xl leading-tight sm:text-2xl dark:text-gray-100">
            <FormattedMessage
              id="towns.heading"
              defaultMessage="MRT & LRT stations by town"
            />
          </h1>
          <p className="mx-auto max-w-2xl text-gray-600 text-xs leading-4 sm:text-sm sm:leading-5 dark:text-gray-400">
            <FormattedMessage
              id="towns.intro"
              defaultMessage="Find every rail station serving your area, the lines that connect it, and the latest service information."
            />
          </p>
          <dl className="mt-2 flex items-center gap-4 text-xs">
            <div className="flex items-baseline gap-1">
              <dd className="font-semibold text-gray-900 dark:text-gray-100">
                <FormattedNumber value={data.towns.length} />
              </dd>
              <dt className="text-gray-500 dark:text-gray-400">
                <FormattedMessage
                  id="towns.summary.towns"
                  defaultMessage="towns"
                />
              </dt>
            </div>
            <div className="flex items-baseline gap-1 border-gray-200 border-l pl-4 dark:border-gray-700">
              <dd className="font-semibold text-gray-900 dark:text-gray-100">
                <FormattedNumber value={stationCount} />
              </dd>
              <dt className="text-gray-500 dark:text-gray-400">
                <FormattedMessage
                  id="towns.summary.stations"
                  defaultMessage="stations"
                />
              </dt>
            </div>
          </dl>
        </header>

        <section
          aria-labelledby="town-directory-heading"
          className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800"
        >
          <div className="border-gray-200 border-b px-4 py-4 sm:px-5 dark:border-gray-700">
            <div>
              <h2
                id="town-directory-heading"
                className="font-semibold text-gray-900 text-sm sm:text-base dark:text-gray-100"
              >
                <FormattedMessage
                  id="towns.directory.heading"
                  defaultMessage="All towns"
                />
              </h2>
              <p className="mt-1 text-gray-600 text-xs leading-5 sm:text-sm dark:text-gray-400">
                <FormattedMessage
                  id="towns.directory.description"
                  defaultMessage="Select a town for its station map, current status and recent disruptions."
                />
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-1.5 p-2 sm:p-3">
            {summaries.map((summary) => {
              const town = included.towns[summary.townId];
              const townName = getLocalizedTranslation(town.name, intl.locale);

              return (
                <article
                  key={town.id}
                  className="group relative flex min-w-0 items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2.5 transition-colors hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-gray-600 dark:hover:bg-gray-700/50"
                >
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-semibold text-gray-900 text-sm dark:text-gray-100">
                      <Link
                        to="/{-$lang}/towns/$townId"
                        params={{ townId: town.id }}
                        className="after:absolute after:inset-0"
                        title={townName}
                      >
                        {townName}
                      </Link>
                    </h3>
                    <p className="mt-0.5 text-gray-500 text-xs dark:text-gray-400">
                      <FormattedMessage
                        id="towns.card.station_count"
                        defaultMessage="{count, plural, one {# station} other {# stations}}"
                        values={{ count: summary.stationIds.length }}
                      />
                    </p>
                  </div>

                  <div className="relative z-10 flex max-w-[60%] shrink-0 items-center justify-end gap-3">
                    <div className="min-w-0 text-right">
                      <p className="sr-only">
                        <FormattedMessage
                          id="towns.card.lines"
                          defaultMessage="Lines serving this town"
                        />
                      </p>
                      <LineBar lineIds={summary.lineIds} />
                    </div>
                    <ArrowRightIcon className="size-4 shrink-0 text-gray-400 transition-transform group-hover:translate-x-0.5 group-hover:text-accent-light" />
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </IncludedEntitiesContext.Provider>
  );
}
