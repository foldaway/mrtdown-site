import { and, asc, eq } from 'drizzle-orm';
import { readCompletedPageProfileGeneration } from '~/db/pageProfileGeneration';
import {
  impactEventEntityFacilitiesTable,
  impactEventEntityServicesTable,
  landmarksTable,
  stationExitsTable,
  stationPlatformServicesTable,
  stationPlatformsTable,
  townsTable,
} from '~/db/schema';
import { readCanonicalManifestFingerprint } from '~/workflows/pull/helpers/manifestFingerprint';
import { getDefaultDb } from './dbQueries/database';
import { readDatasetInputs } from './dbQueries/dataset';
import { readRangeReferenceRows } from './dbQueries/rangeReferences';
import { parseStationProfileSnapshotInputs } from './dbQueries/stationProfileSnapshotInputs';
import { getPageProfileRedis } from './pageProfileRedis.server';
import { createPublishedSnapshotStore } from './publishedSnapshotStore.server';

export const stationProfileSnapshotStore = createPublishedSnapshotStore(
  getPageProfileRedis,
  'station-profiles',
  parseStationProfileSnapshotInputs,
);

/** Keep one completed graph in one bounded payload, independent of range inputs. */
export async function publishStationProfileSnapshot(fingerprint?: string) {
  if (!process.env.REDIS_URL) return;
  const expected = await stationProfileSnapshotStore.head();
  const db = await getDefaultDb();
  const snapshot = await db.transaction(
    async (tx) => {
      const generation = await readCompletedPageProfileGeneration(tx);
      const identity =
        fingerprint ?? (await readCanonicalManifestFingerprint(tx));
      if (!generation || !identity)
        throw new Error('Station profiles require completed canonical inputs');
      const references = await readRangeReferenceRows(tx);
      const [
        dataset,
        townsRows,
        landmarksRows,
        platforms,
        exits,
        serviceReferences,
        facilityReferences,
      ] = await Promise.all([
        readDatasetInputs(tx, undefined, undefined, { references }),
        tx
          .select({
            id: townsTable.id,
            name: townsTable.name,
            hash: townsTable.hash,
          })
          .from(townsTable),
        tx
          .select({
            id: landmarksTable.id,
            name: landmarksTable.name,
            hash: landmarksTable.hash,
          })
          .from(landmarksTable),
        tx
          .select({
            stationId: stationPlatformsTable.station_id,
            id: stationPlatformsTable.platform_id,
            label: stationPlatformsTable.label,
            lineId: stationPlatformsTable.line_id,
            boardingStatus: stationPlatformsTable.boarding_status,
            serviceId: stationPlatformServicesTable.service_id,
          })
          .from(stationPlatformsTable)
          .leftJoin(
            stationPlatformServicesTable,
            and(
              eq(
                stationPlatformServicesTable.station_id,
                stationPlatformsTable.station_id,
              ),
              eq(
                stationPlatformServicesTable.platform_id,
                stationPlatformsTable.platform_id,
              ),
            ),
          ),
        tx
          .select({
            stationId: stationExitsTable.station_id,
            id: stationExitsTable.source_object_id,
            label: stationExitsTable.label,
          })
          .from(stationExitsTable)
          // Duplicate labels keep the final row; break ties the same way in
          // scoped SQL and whole-network publication, independent of query plans.
          .orderBy(
            asc(stationExitsTable.label),
            asc(stationExitsTable.source_object_id),
            asc(stationExitsTable.source_id),
          ),
        // Profile candidate/scope SQL includes historical references, even when
        // a newer state event supersedes them. Range assembly omits these.
        tx
          .select({
            impact_event_id: impactEventEntityServicesTable.impact_event_id,
            service_id: impactEventEntityServicesTable.service_id,
          })
          .from(impactEventEntityServicesTable),
        tx
          .select({
            impact_event_id: impactEventEntityFacilitiesTable.impact_event_id,
            station_id: impactEventEntityFacilitiesTable.station_id,
            line_id: impactEventEntityFacilitiesTable.line_id,
            kind: impactEventEntityFacilitiesTable.kind,
          })
          .from(impactEventEntityFacilitiesTable),
      ]);
      return {
        generation,
        fingerprint: identity,
        inputs: {
          dataset: {
            ...dataset,
            townsRows,
            landmarksRows,
            impactEventServiceRows: serviceReferences,
            impactEventFacilityRows: facilityReferences,
          },
          platforms,
          exits,
        },
      };
    },
    { isolationLevel: 'repeatable read', accessMode: 'read only' },
  );
  const result = await stationProfileSnapshotStore.publish(
    expected.raw,
    snapshot.inputs,
    snapshot.generation,
    snapshot.fingerprint,
  );
  console.info(
    JSON.stringify({ event: 'station_profiles_published', ...result }),
  );
  return result;
}
