import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/{-$lang}/weekly/$week')({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: '/{-$lang}/reports/weekly/$week',
      params,
      statusCode: 301,
    });
  },
});
