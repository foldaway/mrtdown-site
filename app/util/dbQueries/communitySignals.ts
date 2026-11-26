import { setResponseHeader } from '@tanstack/react-start/server';
import type { DateTime } from 'luxon';
import { readCachedCommunitySignals } from '~/util/communitySignalCache.server';
import {
  getPublicCrowdReportSignals,
  PAGE_COMMUNITY_SIGNAL_POLICY,
} from '~/util/crowdReports';
import { getDefaultDb } from './database';

export type CommunitySignalOptions = {
  includeCommunitySignals?: boolean;
};

export async function getPageCommunitySignals(
  options: CommunitySignalOptions,
  scope: { lineId?: string; stationId?: string; now?: DateTime } = {},
) {
  if (!options.includeCommunitySignals) {
    return [];
  }

  if (process.env.REDIS_URL) {
    const cached = await readCachedCommunitySignals(scope);
    if (cached.status === 'ready') return cached.signals;
    setResponseHeader('Cache-Control', 'no-store');
  }

  const communitySignalsDb = await getDefaultDb();
  return getPublicCrowdReportSignals(communitySignalsDb, {
    ...scope,
    ...PAGE_COMMUNITY_SIGNAL_POLICY,
  });
}
