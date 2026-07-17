import { getPublicCrowdReportSignals } from '~/util/crowdReports';
import { getDefaultDb } from './database';

export type CommunitySignalOptions = {
  includeCommunitySignals?: boolean;
};

export async function getPageCommunitySignals(
  options: CommunitySignalOptions,
  scope: { lineId?: string; stationId?: string } = {},
) {
  if (!options.includeCommunitySignals) {
    return [];
  }

  const communitySignalsDb = await getDefaultDb();
  return getPublicCrowdReportSignals(communitySignalsDb, scope);
}
