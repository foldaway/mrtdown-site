import { createFileRoute, redirect } from '@tanstack/react-router';
import { DateTime } from 'luxon';
import { buildLocaleAwareLink } from '~/helpers/buildLocaleAwareLink';

export const Route = createFileRoute('/{-$lang}/history/')({
  loader: ({ params }) => {
    const { lang = 'en-SG' } = params;
    const now = DateTime.now().setZone('Asia/Singapore');
    const targetPage = `/history/${now.year}/${now.toFormat('MM')}`;
    return redirect({ to: buildLocaleAwareLink(targetPage, lang) });
  },
});
