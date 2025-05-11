import { redirect } from 'react-router';
import type { IssuesHistory } from '../types';
import type { Route } from './+types/($lang).history._index';
import type { SitemapFunction } from 'remix-sitemap';
import { LANGUAGES_NON_DEFAULT } from '~/constants';

export function headers() {
  return {
    'Cache-Control': 'max-age=60, s-maxage=60',
  };
}

export const sitemap: SitemapFunction = async ({ config }) => {
  return [
    {
      loc: '/history',
      alternateRefs: LANGUAGES_NON_DEFAULT.map((lang) => {
        return {
          href: new URL(`/${lang}`, config.siteUrl).toString(),
          hreflang: lang,
        };
      }),
    },
  ];
};

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
