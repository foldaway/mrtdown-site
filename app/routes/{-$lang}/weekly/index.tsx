import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/{-$lang}/weekly/')({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: '/{-$lang}/reports/weekly',
      params: { lang: params.lang },
      statusCode: 301,
    });
  },
});
