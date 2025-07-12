import { ArrowLeftIcon, ArrowRightIcon } from '@heroicons/react/16/solid';
import classNames from 'classnames';
import { DateTime, Interval } from 'luxon';
import { useMemo } from 'react';
import { createIntl, FormattedDateTimeRange } from 'react-intl';
import { Link } from 'react-router';
import { buildLocaleAwareLink } from '~/helpers/buildLocaleAwareLink';
import { IssuesHistoryPageViewer } from '../components/IssuesHistoryPageViewer';
import { useHydrated } from '../hooks/useHydrated';
import { useViewport } from '../hooks/useViewport';
import type { IssuesHistory, IssuesHistoryPage } from '../types';
import { assert } from '../util/assert';
import type { Route } from './+types/($lang).history.page.$pageNum';

export async function loader({ params }: Route.LoaderArgs) {
  const rootUrl = process.env.ROOT_URL;

  const { pageNum } = params;

  const pageNumber = Number.parseInt(pageNum, 10);
  assert(!Number.isNaN(pageNumber), 'Invalid page number');

  const res = await fetch(
    'https://data.mrtdown.foldaway.space/product/issues_history.json',
  );
  const history: IssuesHistory = await res.json();
  const page: IssuesHistoryPage = await fetch(
    `https://data.mrtdown.foldaway.space/product/issues_history_page_${pageNumber}.json`,
  ).then((r) => r.json());

  const { lang = 'en-SG' } = params;
  const { default: messages } = await import(`../../lang/${lang}.json`);

  const intl = createIntl({
    locale: lang,
    messages,
  });

  const title = intl.formatMessage(
    {
      id: 'site.title_history',
      defaultMessage: 'Incident History - Page {num}',
    },
    {
      num: params.pageNum,
    },
  );

  return { history, page, title, rootUrl };
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

const HistoryPage: React.FC<Route.ComponentProps> = (props) => {
  const { loaderData, params } = props;
  const { lang, pageNum } = params;
  const pageNumber = Number.parseInt(pageNum, 10);
  const { history, page } = loaderData;
  const { pageCount } = history;

  const viewport = useViewport();

  const maximumPaginationButtonCount = useMemo(
    () => (viewport === 'xs' ? 11 : 21),
    [viewport],
  );

  const pageNumbers = useMemo(() => {
    if (pageCount < maximumPaginationButtonCount) {
      return Array.from({ length: pageCount }, (_, x) =>
        Math.round(lowestPageIndex + x),
      );
    }
    const lowestPageIndex = Math.floor(
      pageNumber - maximumPaginationButtonCount / 2,
    );
    if (lowestPageIndex < 0) {
      return Array.from(
        { length: maximumPaginationButtonCount },
        (_, x) => 0 + x,
      );
    }
    const highestPageIndex = Math.ceil(
      pageNumber + maximumPaginationButtonCount / 2,
    );
    if (highestPageIndex > pageCount) {
      return Array.from(
        { length: maximumPaginationButtonCount },
        (_, x) => pageCount - (maximumPaginationButtonCount - x),
      );
    }
    return Array.from(
      { length: maximumPaginationButtonCount },
      (_, x) => lowestPageIndex + x,
    );
  }, [pageNumber, pageCount, maximumPaginationButtonCount]);

  const interval = useMemo(() => {
    return Interval.fromDateTimes(
      DateTime.fromISO(page.startAt).setZone('Asia/Singapore', {
        keepLocalTime: true,
      }),
      DateTime.fromISO(page.endAt).setZone('Asia/Singapore', {
        keepLocalTime: true,
      }),
    );
  }, [page]);

  const isHydrated = useHydrated();

  return (
    <div className="flex flex-col gap-y-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-1.5">
        <div className="flex grow items-center justify-center gap-x-3">
          <button
            type="button"
            className="rounded p-1 text-gray-700 hover:bg-gray-200 disabled:pointer-events-none disabled:opacity-40 dark:text-gray-50 dark:hover:bg-gray-700"
            disabled={pageNumber === 1}
          >
            <Link
              to={buildLocaleAwareLink(`/history/page/${pageNumber - 1}`, lang)}
            >
              <ArrowLeftIcon className="size-4" />
            </Link>
          </button>

          <div className="flex min-w-48 flex-col items-center">
            {interval != null && (
              <span className="font-bold text-base text-gray-800 dark:text-gray-100">
                {isHydrated ? (
                  <FormattedDateTimeRange
                    from={interval.start!.toJSDate()}
                    to={interval.end!.toJSDate()}
                    month="long"
                    year="numeric"
                  />
                ) : (
                  interval.toISO()
                )}
              </span>
            )}
          </div>

          <button
            type="button"
            className="rounded p-1 text-gray-700 hover:bg-gray-200 disabled:pointer-events-none disabled:opacity-40 dark:text-gray-50 dark:hover:bg-gray-700"
            disabled={pageNumber >= pageCount}
          >
            <Link
              to={buildLocaleAwareLink(`/history/page/${pageNumber + 1}`, lang)}
            >
              <ArrowRightIcon className="size-4" />
            </Link>
          </button>
        </div>
      </div>

      <IssuesHistoryPageViewer page={page} />

      <div className="flex items-center justify-center">
        <button
          type="button"
          className="rounded p-1 text-gray-700 hover:bg-gray-200 disabled:pointer-events-none disabled:opacity-40 dark:text-gray-50 dark:hover:bg-gray-700"
          disabled={pageNumber === 1}
        >
          <Link
            to={buildLocaleAwareLink(`/history/page/${pageNumber - 1}`, lang)}
          >
            <ArrowLeftIcon className="size-4" />
          </Link>
        </button>

        {pageNumbers.map((i) => (
          <button
            key={i}
            type="button"
            className={classNames(
              'size-8 rounded text-gray-700 hover:bg-gray-200 disabled:opacity-40 dark:text-gray-50 dark:hover:bg-gray-700',
              {
                'bg-gray-200 font-bold dark:bg-gray-700': i + 1 === pageNumber,
              },
            )}
          >
            <Link to={buildLocaleAwareLink(`/history/page/${i + 1}`, lang)}>
              {i + 1}
            </Link>
          </button>
        ))}

        <button
          type="button"
          className="rounded p-1 text-gray-700 hover:bg-gray-200 disabled:pointer-events-none disabled:opacity-40 dark:text-gray-50 dark:hover:bg-gray-700"
          disabled={pageNumber >= pageCount}
        >
          <Link
            to={buildLocaleAwareLink(`/history/page/${pageNumber + 1}`, lang)}
          >
            <ArrowRightIcon className="size-4" />
          </Link>
        </button>
      </div>
    </div>
  );
};

export default HistoryPage;
