import { getPublicCrowdReportSignals } from '~/util/crowdReports';
import { getDefaultDb } from './database';

const DISPLAY_MIN_REPORT_COUNT = 1;
const DISPLAY_MIN_DISTINCT_REPORTERS = 1;

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
  return getPublicCrowdReportSignals(communitySignalsDb, {
    ...scope,
    includeUnconfirmedClusters: true,
    minDistinctIpHashes: DISPLAY_MIN_DISTINCT_REPORTERS,
    minReportCount: DISPLAY_MIN_REPORT_COUNT,
  });
}
