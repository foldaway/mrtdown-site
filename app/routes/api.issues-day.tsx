import { getIssuesHistoryYearMonthDay } from '~/client';
import { assert } from '../util/assert';
import type { Route } from './+types/api.issues-day';

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const year = url.searchParams.get('year');
  const month = url.searchParams.get('month');
  const day = url.searchParams.get('day');

  if (!year || !month || !day) {
    return new Response('Missing required parameters: year, month, day', {
      status: 400,
      statusText: 'Bad Request',
    });
  }

  const { data, error, response } = await getIssuesHistoryYearMonthDay({
    auth: () => process.env.API_TOKEN,
    baseUrl: process.env.API_ENDPOINT,
    path: {
      year,
      month,
      day,
    },
  });

  if (error != null) {
    console.error('Error fetching issues for day:', error);
    return new Response('Failed to fetch issues for day', {
      status: response?.status ?? 500,
      statusText: response?.statusText ?? 'Internal Server Error',
    });
  }

  assert(data != null);

  return Response.json({
    success: true,
    data: data.data,
    included: data.included,
  });
}