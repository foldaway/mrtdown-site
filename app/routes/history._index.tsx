import { redirect } from 'react-router';
import type { IssuesHistory } from '../types';

export async function loader() {
  const res = await fetch(
    'https://data.mrtdown.foldaway.space/product/issues_history.json',
  );
  const history: IssuesHistory = await res.json();
  return redirect(`/history/page/${history.pageCount}`);
}
