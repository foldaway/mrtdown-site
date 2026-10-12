import { createFileRoute, notFound, redirect } from '@tanstack/react-router';
import { LOCALES, PRIMARY_LOCALE } from '~/constants';

export const Route = createFileRoute('/{-$lang}/reports/')({
  beforeLoad({ params }) {
    if (
      !LOCALES.includes(
        (params.lang ?? PRIMARY_LOCALE) as (typeof LOCALES)[number],
      )
    ) {
      throw notFound();
    }
    // Restore the reports index when a second reporting frequency ships.
    throw redirect({
      to: '/{-$lang}/reports/weekly',
      params: { lang: params.lang },
      statusCode: 302,
    });
  },
});
