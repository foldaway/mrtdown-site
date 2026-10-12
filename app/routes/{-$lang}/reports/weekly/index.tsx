import { createFileRoute, Link, notFound } from '@tanstack/react-router';
import { createIntl, useIntl } from 'react-intl';
import { LOCALES, PRIMARY_LOCALE } from '~/constants';
import { buildLocalizedAbsoluteUrl, buildSeoMetadata } from '~/helpers/seo';
import { getWeeklyArchiveFn } from '~/util/weeklyArchive.functions';
import { weeklyMessages } from '~/util/weeklyReport.messages';
import { formatReportWeek } from '~/util/weeklyReport.prose';
import { buildWeeklyJsonLd, weeklySocialMeta } from '~/util/weeklyReport.seo';

export const Route = createFileRoute('/{-$lang}/reports/weekly/')({
  component: WeeklyArchivePage,
  loader({ params }) {
    if (
      !LOCALES.includes(
        (params.lang ?? PRIMARY_LOCALE) as (typeof LOCALES)[number],
      )
    )
      throw notFound();
    return getWeeklyArchiveFn();
  },
  async head({ params, loaderData }) {
    const locale = (params.lang ?? PRIMARY_LOCALE) as (typeof LOCALES)[number];
    const { default: messages } = await import(
      `../../../../../lang/${locale}.json`
    );
    const intl = createIntl({ locale, messages });
    const rootUrl = import.meta.env.VITE_ROOT_URL;
    const seo = buildSeoMetadata({
      lang: locale,
      path: '/reports/weekly',
      rootUrl,
    });
    const title = intl.formatMessage(weeklyMessages.archiveTitle);
    const description = intl.formatMessage(weeklyMessages.archiveDescription);
    return {
      links: seo.links,
      meta: [...weeklySocialMeta({ seo, title, description })],
      scripts: [
        {
          type: 'application/ld+json',
          children: JSON.stringify(
            buildWeeklyJsonLd({
              seo,
              title,
              description,
              locale,
              rootUrl,
              archiveTitle: intl.formatMessage(weeklyMessages.archiveHeading),
              weeks: (loaderData?.weeks ?? []).map(({ week }) => ({
                url: buildLocalizedAbsoluteUrl(
                  `/reports/weekly/${week}`,
                  locale,
                  rootUrl,
                ),
                title: intl.formatMessage(weeklyMessages.title, {
                  week: formatReportWeek(week, intl),
                }),
              })),
            }),
          ).replace(/</g, '\\u003c'),
        },
      ],
    };
  },
});

function WeeklyArchivePage() {
  const { weeks } = Route.useLoaderData();
  const { lang } = Route.useParams();
  const intl = useIntl();
  const years = [...new Set(weeks.map((week) => week.year))];
  return (
    <div className="mx-auto w-full max-w-4xl space-y-9 text-gray-900 dark:text-gray-100">
      <Link
        to="/{-$lang}/reports"
        params={{ lang }}
        className="text-gray-600 text-sm hover:underline dark:text-gray-300"
      >
        ← {intl.formatMessage(weeklyMessages.reportsHeading)}
      </Link>
      <header className="border-gray-900 border-t-4 pt-6 dark:border-gray-100">
        <p className="font-semibold text-gray-500 text-xs uppercase tracking-widest dark:text-gray-400">
          {intl.formatMessage(weeklyMessages.eyebrow)}
        </p>
        <h1 className="mt-4 font-bold text-4xl tracking-tight sm:text-5xl">
          {intl.formatMessage(weeklyMessages.archiveHeading)}
        </h1>
        <p className="mt-4 max-w-2xl text-gray-600 leading-relaxed dark:text-gray-300">
          {intl.formatMessage(weeklyMessages.archiveIntro)}
        </p>
      </header>
      {weeks.length === 0 && (
        <p>{intl.formatMessage(weeklyMessages.archiveEmpty)}</p>
      )}
      {years.map((year) => (
        <section key={year} aria-labelledby={`archive-year-${year}`}>
          <h2 id={`archive-year-${year}`} className="font-semibold text-2xl">
            {intl.formatNumber(year, { useGrouping: false })}
          </h2>
          <ul className="mt-3 grid gap-x-8 sm:grid-cols-2">
            {weeks
              .filter((week) => week.year === year)
              .map(({ week, partial }) => (
                <li
                  key={week}
                  className="border-gray-200 border-b dark:border-gray-700"
                >
                  <Link
                    to="/{-$lang}/reports/weekly/$week"
                    params={{ lang, week }}
                    className="flex flex-wrap items-center justify-between gap-2 py-4 hover:underline"
                  >
                    <span>{formatReportWeek(week, intl)}</span>
                    {partial && (
                      <span className="text-amber-700 text-xs dark:text-amber-300">
                        {intl.formatMessage(weeklyMessages.inProgress)}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
