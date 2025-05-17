import { redirect } from 'react-router';
import type { IssuesHistory } from '../types';
import type { Route } from './+types/($lang).history._index';

export function headers() {
  return {
    'Cache-Control': 'max-age=60, s-maxage=60',
  };
}

export async function loader({ params }: Route.LoaderArgs) {
  const res = await fetch(
    'https://data.mrtdown.foldaway.space/product/issues_history.json',
  );
  const history: IssuesHistory = await res.json();
  if (params.lang != null) {
    return redirect(`/${params.lang}/history/page/${history.pageCount}`);
  }
  return redirect(`/history/page/${history.pageCount}`);
}
