import { createFileRoute, redirect } from '@tanstack/react-router';
import { buildLocaleAwareLink } from '~/helpers/buildLocaleAwareLink';

export const Route = createFileRoute('/{-$lang}/history/page/$pageNum')({
  loader: ({ params }) => {
    return redirect({ to: buildLocaleAwareLink('/history', params.lang) });
  },
});
