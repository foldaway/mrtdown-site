import { buildLocaleAwareLink } from './buildLocaleAwareLink';

export function getCanonicalStationPath({
  lang,
  requestedStationId,
  resolvedStationId,
}: {
  lang?: string;
  requestedStationId: string;
  resolvedStationId: string;
}) {
  if (requestedStationId === resolvedStationId) {
    return null;
  }

  return buildLocaleAwareLink(`/stations/${resolvedStationId}`, lang);
}
