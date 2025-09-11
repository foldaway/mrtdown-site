import { DateTime } from 'luxon';
import { redirect } from 'react-router';
import type { Route } from './+types/($lang).history._index';

export function headers() {
  return {
    'Cache-Control': 'max-age=60, s-maxage=60',
  };
}

export async function loader({ params }: Route.LoaderArgs) {
  const now = DateTime.now().setZone('Asia/Singapore');
  const targetPage = `/history/${now.year}/${now.toFormat('MM')}`;
  if (params.lang != null) {
    return redirect(`/${params.lang}${targetPage}`);
  }
  return redirect(targetPage);
}
