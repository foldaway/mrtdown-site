import { redirect } from 'react-router';
import type { Route } from './+types/($lang).status.$lineId';

export async function loader({ params }: Route.LoaderArgs) {
  const { lineId } = params;

  return redirect(`/lines/${lineId}`);
}
