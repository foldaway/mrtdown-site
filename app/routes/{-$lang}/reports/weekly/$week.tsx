import { createFileRoute, Link, notFound } from '@tanstack/react-router';
import { DateTime } from 'luxon';
import { createIntl, useIntl } from 'react-intl';
import { LOCALES, PRIMARY_LOCALE } from '~/constants';
import { getLocalizedTranslation } from '~/helpers/getLocalizedTranslation';
import { buildSeoMetadata } from '~/helpers/seo';
import { getReportWeek, REPORT_ZONE } from '~/util/weeklyReport';
import { getWeeklyReportFn } from '~/util/weeklyReport.functions';
import { formatWeeklyInsights } from '~/util/weeklyReport.insights';
import { weeklyMessages } from '~/util/weeklyReport.messages';
import {
  buildWeeklyProse,
  formatCountChange,
  formatReportDates,
  formatReportDuration,
  formatReportWeek,
  formatTimeChange,
} from '~/util/weeklyReport.prose';
import { buildWeeklyJsonLd, weeklySocialMeta } from '~/util/weeklyReport.seo';

export const Route = createFileRoute('/{-$lang}/reports/weekly/$week')({
  component: WeeklyReportPage,
  async loader({ params }) {
    if (
      !LOCALES.includes(
        (params.lang ?? PRIMARY_LOCALE) as (typeof LOCALES)[number],
      )
    )
      throw notFound();
    try {
      getReportWeek(params.week, DateTime.now().setZone(REPORT_ZONE));
    } catch {
      throw notFound();
    }
    const report = await getWeeklyReportFn({ data: { week: params.week } });
    if (report == null) throw notFound();
    return report;
  },
  async head({ params, loaderData }) {
    const locale = params.lang ?? PRIMARY_LOCALE;
    const { default: messages } = await import(
      `../../../../../lang/${locale}.json`
    );
    const intl = createIntl({ locale, messages });
    const seo = buildSeoMetadata({
      lang: (params.lang ?? PRIMARY_LOCALE) as (typeof LOCALES)[number],
      path: `/reports/weekly/${params.week}`,
      rootUrl: import.meta.env.VITE_ROOT_URL,
    });
    const dates = formatReportDates(params.week, intl);
    const title = intl.formatMessage(weeklyMessages.title, {
      week: formatReportWeek(params.week, intl),
    });
    const description = intl.formatMessage(weeklyMessages.description, {
      dates,
    });
    return {
      links: seo.links,
      meta: [
        ...weeklySocialMeta({ seo, title, description }, true),
        ...(loaderData?.partial
          ? [{ name: 'robots', content: 'noindex, follow' }]
          : []),
      ],
      scripts: [
        {
          type: 'application/ld+json',
          children: JSON.stringify(
            buildWeeklyJsonLd({
              seo,
              title,
              description,
              locale,
              rootUrl: import.meta.env.VITE_ROOT_URL,
              archiveTitle: intl.formatMessage(weeklyMessages.archiveHeading),
              report: loaderData
                ? {
                    week: loaderData.week,
                    endDate: loaderData.endDate,
                    prose: [
                      ...formatWeeklyInsights(loaderData, intl),
                      ...buildWeeklyProse(loaderData, intl),
                    ],
                  }
                : undefined,
            }),
          ).replace(/</g, '\\u003c'),
        },
      ],
    };
  },
});

type MetricProps = { label: string; value: string; detail: string };
function Metric({ label, value, detail }: MetricProps) {
  return (
    <div className="border-gray-200 border-t py-5 dark:border-gray-700">
      <p className="text-gray-500 text-sm dark:text-gray-400">{label}</p>
      <p className="mt-2 font-bold text-3xl tracking-tight">{value}</p>
      <p className="mt-2 text-gray-500 text-xs dark:text-gray-400">{detail}</p>
    </div>
  );
}

function WeeklyReportPage() {
  const report = Route.useLoaderData();
  const { lang } = Route.useParams();
  const intl = useIntl();
  const navigate = Route.useNavigate();
  const { current, previous } = report;
  const start = DateTime.fromISO(report.week, { zone: REPORT_ZONE });
  const dateLabel = formatReportDates(report.week, intl);
  const previousWeek = start.minus({ weeks: 1 }).toISODate() as string;
  const nextWeek = start.plus({ weeks: 1 }).toISODate() as string;
  const maxCount = Math.max(1, ...current.days.map((day) => day.count));
  const prose = buildWeeklyProse(report, intl);
  const insights = formatWeeklyInsights(report, intl);
  const duration = (seconds: number) => formatReportDuration(seconds, intl);
  const text = (key: keyof typeof weeklyMessages) =>
    intl.formatMessage(weeklyMessages[key]);
  return (
    <article
      lang={intl.locale}
      className="mx-auto w-full max-w-4xl space-y-9 text-gray-900 sm:space-y-12 dark:text-gray-100"
    >
      <nav
        aria-label={text('nav')}
        className="flex flex-wrap items-center justify-between gap-3 text-sm"
      >
        {previousWeek >= report.earliestWeek && (
          <Link
            to="/{-$lang}/reports/weekly/$week"
            params={{ lang, week: previousWeek }}
            className="text-gray-600 hover:underline dark:text-gray-300"
          >
            {text('prev')}
          </Link>
        )}
        <Link
          to="/{-$lang}/reports/weekly"
          params={{ lang }}
          className="text-gray-600 hover:underline dark:text-gray-300"
        >
          {text('archiveLink')}
        </Link>
        {nextWeek < report.currentWeek ? (
          <Link
            to="/{-$lang}/reports/weekly/$week"
            params={{ lang, week: nextWeek }}
            className="text-gray-600 hover:underline dark:text-gray-300"
          >
            {text('next')}
          </Link>
        ) : (
          <span className="text-gray-400">{text('latest')}</span>
        )}
      </nav>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          const value = String(new FormData(event.currentTarget).get('week'));
          if (value)
            void navigate({
              to: '/{-$lang}/reports/weekly/$week',
              params: {
                lang,
                week: DateTime.fromISO(value, { zone: REPORT_ZONE })
                  .startOf('week')
                  .toISODate() as string,
              },
            });
        }}
      >
        <label className="flex flex-col gap-1 text-gray-600 text-xs dark:text-gray-300">
          {text('choose')}
          <input
            key={report.week}
            type="date"
            name="week"
            required
            min={report.earliestWeek}
            defaultValue={report.week}
            max={
              DateTime.fromISO(report.currentWeek)
                .minus({ days: 1 })
                .toISODate() as string
            }
            className="rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-gray-900 text-sm dark:border-gray-600 dark:text-gray-100"
          />
        </label>
        <button
          type="submit"
          className="rounded-lg bg-gray-900 px-4 py-2 font-medium text-sm text-white dark:bg-gray-100 dark:text-gray-900"
        >
          {text('view')}
        </button>
      </form>
      <header className="border-gray-900 border-t-4 pt-6 dark:border-gray-100">
        <p className="font-semibold text-gray-500 text-xs uppercase tracking-widest dark:text-gray-400">
          {text('eyebrow')}
        </p>
        <h1 className="mt-4 font-bold text-4xl tracking-tight sm:text-5xl">
          {formatReportWeek(report.week, intl)}
        </h1>
        <p className="mt-3 text-gray-600 text-lg dark:text-gray-300">
          {intl.formatMessage(weeklyMessages.subtitle, { dates: dateLabel })}
        </p>
        {report.partial && (
          <p className="mt-4 rounded-lg bg-amber-50 p-3 text-amber-900 text-sm dark:bg-amber-950 dark:text-amber-200">
            {text('partial')}
          </p>
        )}
      </header>
      {insights.length > 0 && (
        <section
          aria-labelledby="insight-title"
          className="border-accent-light border-l-4 pl-5 dark:border-accent-dark"
        >
          <h2 id="insight-title" className="font-semibold text-xl">
            {text('insightHeading')}
          </h2>
          <p className="mt-3 max-w-3xl text-gray-600 text-lg leading-relaxed dark:text-gray-300">
            {insights.join(' ')}
          </p>
        </section>
      )}
      <section aria-labelledby="recap-title">
        <h2 id="recap-title" className="font-semibold text-xl">
          {text('recap')}
        </h2>
        <div className="mt-3 max-w-3xl space-y-3 text-gray-600 text-lg leading-relaxed dark:text-gray-300">
          {prose.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
        <div className="mt-5 grid gap-x-7 sm:grid-cols-3">
          <Metric
            label={text('disruptions')}
            value={intl.formatNumber(current.disruptionCount)}
            detail={formatCountChange(
              current.disruptionCount,
              previous.disruptionCount,
              intl,
            )}
          />
          <Metric
            label={text('totalTime')}
            value={duration(current.disruptionSeconds)}
            detail={formatTimeChange(
              current.disruptionSeconds,
              previous.disruptionSeconds,
              intl,
            )}
          />
          <Metric
            label={text('affected')}
            value={intl.formatNumber(current.lines.length)}
            detail={formatCountChange(
              current.lines.length,
              previous.lines.length,
              intl,
            )}
          />
        </div>
      </section>
      <section
        aria-labelledby="daily-title"
        className="rounded-2xl border border-gray-200 p-5 sm:p-7 dark:border-gray-700"
      >
        <h2 id="daily-title" className="font-semibold text-xl">
          {text('daily')}
        </h2>
        <p className="mt-1 text-gray-500 text-sm dark:text-gray-400">
          {text('byDay')}
        </p>
        <ul className="mt-6 grid grid-cols-7 gap-2 sm:gap-4">
          {current.days.map((day) => (
            <li
              key={day.date}
              className="flex min-w-0 flex-col items-center gap-2 text-center text-xs sm:text-sm"
            >
              <span className="font-medium tabular-nums">
                {intl.formatNumber(day.count)}
              </span>
              <div
                aria-hidden="true"
                className="flex h-24 w-full max-w-12 items-end overflow-hidden rounded-t-md bg-gray-100 sm:h-28 dark:bg-gray-800"
              >
                <div
                  className="w-full rounded-t-md bg-disruption-light dark:bg-disruption-dark"
                  style={{ height: `${(day.count / maxCount) * 100}%` }}
                />
              </div>
              <span className="max-w-full break-words">
                {intl.formatDate(
                  DateTime.fromISO(day.date, { zone: REPORT_ZONE }).toJSDate(),
                  { weekday: 'short', timeZone: REPORT_ZONE },
                )}
              </span>
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="lines-title">
        <h2 id="lines-title" className="font-semibold text-xl">
          {text('network')}
        </h2>
        {current.lines.length === 0 ? (
          <p className="mt-3 text-gray-500">{text('noLines')}</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">{text('caption')}</caption>
              <thead className="border-gray-200 border-b text-gray-500 dark:border-gray-700">
                <tr>
                  <th scope="col" className="pb-3 font-medium">
                    {text('line')}
                  </th>
                  <th scope="col" className="pb-3 text-right font-medium">
                    {text('disruptions')}
                  </th>
                  <th scope="col" className="pb-3 text-right font-medium">
                    {text('duration')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {current.lines.map((line) => (
                  <tr
                    key={line.id}
                    className="border-gray-100 border-b dark:border-gray-800"
                  >
                    <th scope="row" className="py-4 font-medium">
                      <Link
                        to="/{-$lang}/lines/$lineId"
                        params={{ lang, lineId: line.id }}
                        className="inline-flex items-center gap-2 hover:underline"
                      >
                        <span
                          className="size-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: line.color }}
                        />
                        {getLocalizedTranslation(line.name, intl.locale)}
                      </Link>
                    </th>
                    <td className="py-4 text-right tabular-nums">
                      {intl.formatNumber(line.count)}
                    </td>
                    <td className="py-4 text-right tabular-nums">
                      {duration(line.seconds)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section aria-labelledby="incidents-title">
        <h2 id="incidents-title" className="font-semibold text-xl">
          {text('happened')}
        </h2>
        <p className="mt-1 text-gray-500 text-sm dark:text-gray-400">
          {text('order')}
        </p>
        {current.incidents.length === 0 ? (
          <p className="mt-4 text-gray-500">{text('empty')}</p>
        ) : (
          <ol className="mt-4 divide-y divide-gray-200 dark:divide-gray-700">
            {current.incidents.map((incident) => (
              <li key={incident.id} className="py-4">
                <div className="flex items-start justify-between gap-4">
                  <Link
                    to="/{-$lang}/issues/$issueId"
                    params={{ lang, issueId: incident.id }}
                    className="font-semibold hover:underline"
                  >
                    {getLocalizedTranslation(incident.title, intl.locale)} →
                  </Link>
                  <span className="shrink-0 text-gray-500 text-sm">
                    {duration(incident.seconds)}
                  </span>
                </div>
                <p className="mt-1 text-gray-500 text-xs">
                  {incident.lineIds.join(' · ')}
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>
      <footer className="space-y-3 border-gray-200 border-t pt-5 text-gray-500 text-xs leading-relaxed dark:border-gray-700">
        <p>{text('note')}</p>
        <details>
          <summary className="cursor-pointer">{text('about')}</summary>
          <p className="mt-2">{text('method')}</p>
        </details>
        <p>
          {intl.formatMessage(weeklyMessages.updated, {
            date: intl.formatDate(report.asOf, {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              timeZone: REPORT_ZONE,
            }),
          })}{' '}
          <Link to="/{-$lang}/about" params={{ lang }} className="underline">
            {text('how')}
          </Link>
        </p>
      </footer>
    </article>
  );
}
