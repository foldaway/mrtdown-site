import { createFileRoute, redirect } from '@tanstack/react-router';
import { buildLocaleAwareLink } from '~/helpers/buildLocaleAwareLink';

export const Route = createFileRoute('/{-$lang}/status/$lineId')({
  async loader({ params }) {
    const { lang = 'en-SG', lineId } = params;

    return redirect({ to: buildLocaleAwareLink(`/lines/${lineId}`, lang) });
  },
});
