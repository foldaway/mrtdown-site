/**
 * Promotes data from `*_next` staging tables (filled during the workflow `parse` step)
 * into live Drizzle tables. Each sync runs in its own transaction and uses
 * manifest hashes to skip unchanged rows; orphan deletes use `NOT EXISTS` anti-joins
 * against `*_next` so we avoid huge `IN (...)` parameter lists.
 */
import {
  type Evidence,
  type ImpactEvent,
  type Issue,
  type Landmark,
  type Line,
  type Operator,
  resolvePeriods,
  type Service,
  type Station,
  type Town,
} from '@mrtdown/core';
import {
  eq,
  type InferInsertModel,
  inArray,
  notExists,
  sql,
} from 'drizzle-orm';
import type { getDb } from '../../../db/index.js';
import {
  evidencesTable,
  impactEventBasisEvidencesTable,
  impactEventCausesTable,
  impactEventEntityFacilitiesTable,
  impactEventEntityServicesTable,
  impactEventFacilityEffectsTable,
  impactEventPeriodsTable,
  impactEventServiceEffectsTable,
  impactEventServiceScopesTable,
  impactEventsTable,
  issuesNextTable,
  issuesTable,
  landmarksNextTable,
  landmarksTable,
  lineOperatorsTable,
  lineServicesTable,
  linesNextTable,
  linesTable,
  metadataTable,
  operatorsNextTable,
  operatorsTable,
  serviceRevisionPathStationEntriesTable,
  serviceRevisionsTable,
  servicesNextTable,
  servicesTable,
  stationCodesTable,
  stationLandmarksTable,
  stationsNextTable,
  stationsTable,
  townsNextTable,
  townsTable,
} from '../../../db/schema.js';

/** Max rows per `insert().values()` batch to stay within driver/param limits. */
const BATCH = 500;

type Db = ReturnType<typeof getDb>;

/** Splits an array into fixed-size chunks for batched inserts. */
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

/** Clears all pull staging tables before a new parse run. */
export async function truncateStagingTables(db: Db): Promise<void> {
  // Multi-table TRUNCATE is DDL; Drizzle has no builder — use `sql` with table refs.
  await db.execute(
    sql`TRUNCATE ${operatorsNextTable}, ${townsNextTable}, ${landmarksNextTable}, ${linesNextTable}, ${stationsNextTable}, ${servicesNextTable}, ${issuesNextTable} RESTART IDENTITY`,
  );
}

export async function insertOperatorsStaging(
  db: Db,
  operators: readonly (Operator & { hash: string })[],
): Promise<void> {
  const opRows = operators.map((o) => ({
    id: o.id,
    hash: o.hash,
    name: o.name,
    founded_at: o.foundedAt,
    url: o.url,
  }));
  for (const c of chunk(opRows, BATCH)) {
    if (c.length === 0) continue;
    await db.insert(operatorsNextTable).values(c);
  }
}

export async function insertTownsStaging(
  db: Db,
  towns: readonly (Town & { hash: string })[],
): Promise<void> {
  const townRows = towns.map((t) => ({
    id: t.id,
    hash: t.hash,
    name: t.name,
  }));
  for (const c of chunk(townRows, BATCH)) {
    if (c.length === 0) continue;
    await db.insert(townsNextTable).values(c);
  }
}

export async function insertLandmarksStaging(
  db: Db,
  landmarks: readonly (Landmark & { hash: string })[],
): Promise<void> {
  const lmRows = landmarks.map((l) => ({
    id: l.id,
    hash: l.hash,
    name: l.name,
  }));
  for (const c of chunk(lmRows, BATCH)) {
    if (c.length === 0) continue;
    await db.insert(landmarksNextTable).values(c);
  }
}

export async function insertLinesStaging(
  db: Db,
  lines: readonly (Line & { hash: string })[],
): Promise<void> {
  const lineRows = lines.flatMap((l) => {
    if (l.startedAt == null || l.operatingHours == null) {
      return [];
    }
    return [
      {
        id: l.id,
        hash: l.hash,
        name: l.name,
        type: l.type,
        color: l.color,
        started_at: l.startedAt,
        ended_at: null,
        operating_hours: l.operatingHours,
        operators: l.operators,
      },
    ];
  });
  for (const c of chunk(lineRows, BATCH)) {
    if (c.length === 0) continue;
    await db.insert(linesNextTable).values(c);
  }
}

export async function insertStationsStaging(
  db: Db,
  stations: readonly (Station & { hash: string })[],
): Promise<void> {
  const stationRows = stations.map((s) => ({
    id: s.id,
    hash: s.hash,
    name: s.name,
    // Drizzle/PostGIS: [longitude, latitude] tuple for SRID 4326 point
    geo: [s.geo.longitude, s.geo.latitude] as [number, number],
    town_id: s.townId,
    station_codes: s.stationCodes,
    landmark_ids: s.landmarkIds,
  }));
  for (const c of chunk(stationRows, BATCH)) {
    if (c.length === 0) continue;
    await db.insert(stationsNextTable).values(c);
  }
}

export async function insertServicesStaging(
  db: Db,
  services: readonly (Service & { hash: string })[],
): Promise<void> {
  const serviceRows = services.map((s) => ({
    id: s.id,
    hash: s.hash,
    name: s.name,
    line_id: s.lineId,
    revisions: s.revisions,
  }));
  for (const c of chunk(serviceRows, BATCH)) {
    if (c.length === 0) continue;
    await db.insert(servicesNextTable).values(c);
  }
}

type IssueBundle = {
  issue: Issue & { hash: string };
  evidence: Evidence[];
  impactEvents: ImpactEvent[];
};

export async function insertIssuesStaging(
  db: Db,
  issues: readonly IssueBundle[],
): Promise<void> {
  const issueRows = issues.map(({ issue, evidence, impactEvents }) => ({
    id: issue.id,
    hash: issue.hash,
    type: issue.type,
    title: issue.title,
    title_meta: issue.titleMeta,
    evidences: evidence,
    impact_events: impactEvents,
  }));
  for (const c of chunk(issueRows, BATCH)) {
    if (c.length === 0) continue;
    await db.insert(issuesNextTable).values(c);
  }
}

/**
 * Deletes all rows in impact-event child tables for the given impact event ids.
 * Order matches FK dependencies (children before `impact_events` is deleted elsewhere).
 */
async function deleteImpactEventChildren(
  tx: Parameters<Parameters<Db['transaction']>[0]>[0],
  impactEventIds: string[],
): Promise<void> {
  if (impactEventIds.length === 0) return;
  await tx
    .delete(impactEventPeriodsTable)
    .where(inArray(impactEventPeriodsTable.impact_event_id, impactEventIds));
  await tx
    .delete(impactEventBasisEvidencesTable)
    .where(
      inArray(impactEventBasisEvidencesTable.impact_event_id, impactEventIds),
    );
  await tx
    .delete(impactEventServiceScopesTable)
    .where(
      inArray(impactEventServiceScopesTable.impact_event_id, impactEventIds),
    );
  await tx
    .delete(impactEventServiceEffectsTable)
    .where(
      inArray(impactEventServiceEffectsTable.impact_event_id, impactEventIds),
    );
  await tx
    .delete(impactEventFacilityEffectsTable)
    .where(
      inArray(impactEventFacilityEffectsTable.impact_event_id, impactEventIds),
    );
  await tx
    .delete(impactEventCausesTable)
    .where(inArray(impactEventCausesTable.impact_event_id, impactEventIds));
  await tx
    .delete(impactEventEntityServicesTable)
    .where(
      inArray(impactEventEntityServicesTable.impact_event_id, impactEventIds),
    );
  await tx
    .delete(impactEventEntityFacilitiesTable)
    .where(
      inArray(impactEventEntityFacilitiesTable.impact_event_id, impactEventIds),
    );
}

async function deleteIssuesSubtree(
  tx: Parameters<Parameters<Db['transaction']>[0]>[0],
  issueIds: string[],
): Promise<void> {
  if (issueIds.length === 0) return;

  const impactRows = await tx
    .select({ id: impactEventsTable.id })
    .from(impactEventsTable)
    .where(inArray(impactEventsTable.issue_id, issueIds));
  const impactEventIds = impactRows.map((r) => r.id);

  await deleteImpactEventChildren(tx, impactEventIds);
  await tx
    .delete(impactEventsTable)
    .where(inArray(impactEventsTable.issue_id, issueIds));
  await tx
    .delete(evidencesTable)
    .where(inArray(evidencesTable.issue_id, issueIds));
  await tx.delete(issuesTable).where(inArray(issuesTable.id, issueIds));
}

/** Hash diff staging vs live; upsert changed rows; delete live rows absent from staging. */
async function upsertChangedOperators(
  tx: Parameters<Parameters<Db['transaction']>[0]>[0],
): Promise<void> {
  const rows = await tx
    .select({
      id: operatorsNextTable.id,
      nextHash: operatorsNextTable.hash,
      liveHash: operatorsTable.hash,
    })
    .from(operatorsNextTable)
    .leftJoin(operatorsTable, eq(operatorsNextTable.id, operatorsTable.id));

  const toUpsert = rows.filter(
    (r) => r.liveHash == null || r.liveHash !== r.nextHash,
  );

  for (const ch of chunk(toUpsert, BATCH)) {
    const ids = ch.map((r) => r.id);
    if (ids.length === 0) continue;
    const full = await tx
      .select()
      .from(operatorsNextTable)
      .where(inArray(operatorsNextTable.id, ids));
    for (const row of full) {
      await tx
        .insert(operatorsTable)
        .values({
          id: row.id,
          hash: row.hash,
          name: row.name,
          founded_at: row.founded_at,
          url: row.url,
        })
        .onConflictDoUpdate({
          target: [operatorsTable.id],
          set: {
            hash: row.hash,
            name: row.name,
            founded_at: row.founded_at,
            url: row.url,
            updated_at: new Date(),
          },
        });
    }
  }
  await tx
    .delete(operatorsTable)
    .where(
      notExists(
        tx
          .select()
          .from(operatorsNextTable)
          .where(eq(operatorsNextTable.id, operatorsTable.id)),
      ),
    );
}

/** @see upsertChangedOperators */
async function upsertChangedTowns(
  tx: Parameters<Parameters<Db['transaction']>[0]>[0],
): Promise<void> {
  const rows = await tx
    .select({
      id: townsNextTable.id,
      nextHash: townsNextTable.hash,
      liveHash: townsTable.hash,
    })
    .from(townsNextTable)
    .leftJoin(townsTable, eq(townsNextTable.id, townsTable.id));

  const toUpsert = rows.filter(
    (r) => r.liveHash == null || r.liveHash !== r.nextHash,
  );

  for (const ch of chunk(toUpsert, BATCH)) {
    const ids = ch.map((r) => r.id);
    if (ids.length === 0) continue;
    const full = await tx
      .select()
      .from(townsNextTable)
      .where(inArray(townsNextTable.id, ids));
    for (const row of full) {
      await tx
        .insert(townsTable)
        .values({ id: row.id, hash: row.hash, name: row.name })
        .onConflictDoUpdate({
          target: [townsTable.id],
          set: {
            hash: row.hash,
            name: row.name,
            updated_at: new Date(),
          },
        });
    }
  }
  await tx
    .delete(townsTable)
    .where(
      notExists(
        tx
          .select()
          .from(townsNextTable)
          .where(eq(townsNextTable.id, townsTable.id)),
      ),
    );
}

/** @see upsertChangedOperators */
async function upsertChangedLandmarks(
  tx: Parameters<Parameters<Db['transaction']>[0]>[0],
): Promise<void> {
  const rows = await tx
    .select({
      id: landmarksNextTable.id,
      nextHash: landmarksNextTable.hash,
      liveHash: landmarksTable.hash,
    })
    .from(landmarksNextTable)
    .leftJoin(landmarksTable, eq(landmarksNextTable.id, landmarksTable.id));

  const toUpsert = rows.filter(
    (r) => r.liveHash == null || r.liveHash !== r.nextHash,
  );

  for (const ch of chunk(toUpsert, BATCH)) {
    const ids = ch.map((r) => r.id);
    if (ids.length === 0) continue;
    const full = await tx
      .select()
      .from(landmarksNextTable)
      .where(inArray(landmarksNextTable.id, ids));
    for (const row of full) {
      await tx
        .insert(landmarksTable)
        .values({ id: row.id, hash: row.hash, name: row.name })
        .onConflictDoUpdate({
          target: [landmarksTable.id],
          set: {
            hash: row.hash,
            name: row.name,
            updated_at: new Date(),
          },
        });
    }
  }
  await tx
    .delete(landmarksTable)
    .where(
      notExists(
        tx
          .select()
          .from(landmarksNextTable)
          .where(eq(landmarksNextTable.id, landmarksTable.id)),
      ),
    );
}

/** Operators, towns, landmarks — independent order; single transaction. */
export async function syncOperatorsTownsLandmarks(db: Db): Promise<void> {
  await db.transaction(async (tx) => {
    await upsertChangedOperators(tx);
    await upsertChangedTowns(tx);
    await upsertChangedLandmarks(tx);
  });
}

/**
 * Lines plus `line_operators`. For changed lines: replace operator rows for those
 * line ids, then orphan-delete lines (and operators) not in `lines_next`.
 */
export async function syncLines(db: Db): Promise<void> {
  await db.transaction(async (tx) => {
    const rows = await tx
      .select({
        id: linesNextTable.id,
        nextHash: linesNextTable.hash,
        liveHash: linesTable.hash,
      })
      .from(linesNextTable)
      .leftJoin(linesTable, eq(linesNextTable.id, linesTable.id));

    const changedIds = rows
      .filter((r) => r.liveHash == null || r.liveHash !== r.nextHash)
      .map((r) => r.id);

    for (const ch of chunk(changedIds, BATCH)) {
      if (ch.length === 0) continue;
      const full = await tx
        .select()
        .from(linesNextTable)
        .where(inArray(linesNextTable.id, ch));
      for (const row of full) {
        await tx
          .insert(linesTable)
          .values({
            id: row.id,
            hash: row.hash,
            name: row.name,
            type: row.type,
            color: row.color,
            started_at: row.started_at,
            operating_hours: row.operating_hours,
          })
          .onConflictDoUpdate({
            target: [linesTable.id],
            set: {
              hash: row.hash,
              name: row.name,
              updated_at: new Date(),
            },
          });
      }
      await tx
        .delete(lineOperatorsTable)
        .where(inArray(lineOperatorsTable.line_id, ch));
      for (const row of full) {
        if (row.operators.length > 0) {
          await tx.insert(lineOperatorsTable).values(
            row.operators.map((operator) => {
              return {
                line_id: row.id,
                operator_id: operator.operatorId,
                started_at: operator.startedAt,
                ended_at: operator.endedAt,
                hash: row.hash,
              } satisfies InferInsertModel<typeof lineOperatorsTable>;
            }),
          );
        }
      }
    }

    await tx
      .delete(lineOperatorsTable)
      .where(
        notExists(
          tx
            .select()
            .from(linesNextTable)
            .where(eq(linesNextTable.id, lineOperatorsTable.line_id)),
        ),
      );
    await tx
      .delete(linesTable)
      .where(
        notExists(
          tx
            .select()
            .from(linesNextTable)
            .where(eq(linesNextTable.id, linesTable.id)),
        ),
      );
  });
}

/**
 * Stations plus `station_codes` / `station_landmarks`. For changed stations:
 * child rows are removed and reinserted from staging JSON.
 */
export async function syncStations(db: Db): Promise<void> {
  await db.transaction(async (tx) => {
    const rows = await tx
      .select({
        id: stationsNextTable.id,
        nextHash: stationsNextTable.hash,
        liveHash: stationsTable.hash,
      })
      .from(stationsNextTable)
      .leftJoin(stationsTable, eq(stationsNextTable.id, stationsTable.id));

    const changedIds = rows
      .filter((r) => r.liveHash == null || r.liveHash !== r.nextHash)
      .map((r) => r.id);

    for (const ch of chunk(changedIds, BATCH)) {
      if (ch.length === 0) continue;
      const full = await tx
        .select()
        .from(stationsNextTable)
        .where(inArray(stationsNextTable.id, ch));
      for (const row of full) {
        await tx
          .insert(stationsTable)
          .values({
            id: row.id,
            hash: row.hash,
            name: row.name,
            geo: row.geo,
            townId: row.town_id,
          })
          .onConflictDoUpdate({
            target: [stationsTable.id],
            set: {
              hash: row.hash,
              name: row.name,
              geo: row.geo,
              townId: row.town_id,
            },
          });
      }
      await tx
        .delete(stationCodesTable)
        .where(inArray(stationCodesTable.station_id, ch));
      await tx
        .delete(stationLandmarksTable)
        .where(inArray(stationLandmarksTable.station_id, ch));
      for (const row of full) {
        await tx.insert(stationCodesTable).values(
          row.station_codes.map((stationCode) => {
            return {
              station_id: row.id,
              line_id: stationCode.lineId,
              code: stationCode.code,
              structure_type: stationCode.structureType,
              started_at: stationCode.startedAt,
              ended_at: stationCode.endedAt,
            } satisfies InferInsertModel<typeof stationCodesTable>;
          }),
        );
        await tx.insert(stationLandmarksTable).values(
          row.landmark_ids.map((landmarkId) => {
            return {
              station_id: row.id,
              landmark_id: landmarkId,
            } satisfies InferInsertModel<typeof stationLandmarksTable>;
          }),
        );
      }
    }

    await tx
      .delete(stationCodesTable)
      .where(
        notExists(
          tx
            .select()
            .from(stationsNextTable)
            .where(eq(stationsNextTable.id, stationCodesTable.station_id)),
        ),
      );
    await tx
      .delete(stationLandmarksTable)
      .where(
        notExists(
          tx
            .select()
            .from(stationsNextTable)
            .where(eq(stationsNextTable.id, stationLandmarksTable.station_id)),
        ),
      );
    await tx
      .delete(stationsTable)
      .where(
        notExists(
          tx
            .select()
            .from(stationsNextTable)
            .where(eq(stationsNextTable.id, stationsTable.id)),
        ),
      );
  });
}

/**
 * Services, `line_services`, revisions, and path station entries. Changed services
 * get revisions/path wiped before reinsert (FK order: path entries → revisions → line_services).
 */
export async function syncServices(db: Db): Promise<void> {
  await db.transaction(async (tx) => {
    const rows = await tx
      .select({
        id: servicesNextTable.id,
        nextHash: servicesNextTable.hash,
        liveHash: servicesTable.hash,
      })
      .from(servicesNextTable)
      .leftJoin(servicesTable, eq(servicesNextTable.id, servicesTable.id));

    const changedIds = rows
      .filter((r) => r.liveHash == null || r.liveHash !== r.nextHash)
      .map((r) => r.id);

    for (const ch of chunk(changedIds, BATCH)) {
      if (ch.length === 0) continue;
      await tx
        .delete(serviceRevisionPathStationEntriesTable)
        .where(inArray(serviceRevisionPathStationEntriesTable.service_id, ch));
      await tx
        .delete(serviceRevisionsTable)
        .where(inArray(serviceRevisionsTable.service_id, ch));
      await tx
        .delete(lineServicesTable)
        .where(inArray(lineServicesTable.service_id, ch));

      const full = await tx
        .select()
        .from(servicesNextTable)
        .where(inArray(servicesNextTable.id, ch));
      for (const row of full) {
        await tx
          .insert(servicesTable)
          .values({
            id: row.id,
            hash: row.hash,
            name: row.name,
            line_id: row.line_id,
          })
          .onConflictDoUpdate({
            target: [servicesTable.id],
            set: {
              hash: row.hash,
              name: row.name,
              line_id: row.line_id,
            },
          });
        await tx
          .insert(lineServicesTable)
          .values({
            service_id: row.id,
            line_id: row.line_id,
          } satisfies InferInsertModel<typeof lineServicesTable>)
          .onConflictDoNothing();

        for (const revisionData of row.revisions) {
          await tx
            .insert(serviceRevisionsTable)
            .values({
              id: revisionData.id,
              service_id: row.id,
              operating_hours: revisionData.operatingHours,
            } satisfies InferInsertModel<typeof serviceRevisionsTable>)
            .onConflictDoUpdate({
              target: [
                serviceRevisionsTable.id,
                serviceRevisionsTable.service_id,
              ],
              set: {
                operating_hours: revisionData.operatingHours,
                updated_at: new Date(),
              },
            });

          await tx
            .insert(serviceRevisionPathStationEntriesTable)
            .values(
              revisionData.path.stations.map((station, index) => {
                return {
                  service_revision_id: revisionData.id,
                  service_id: row.id,
                  station_id: station.stationId,
                  display_code: station.displayCode,
                  path_index: index,
                } satisfies InferInsertModel<
                  typeof serviceRevisionPathStationEntriesTable
                >;
              }),
            )
            // Postgres `excluded.*` — update display_code/path_index on conflict
            .onConflictDoUpdate({
              target: [
                serviceRevisionPathStationEntriesTable.service_revision_id,
                serviceRevisionPathStationEntriesTable.station_id,
                serviceRevisionPathStationEntriesTable.path_index,
              ],
              set: {
                display_code: sql.raw(
                  `excluded.${serviceRevisionPathStationEntriesTable.display_code.name}`,
                ),
                path_index: sql.raw(
                  `excluded.${serviceRevisionPathStationEntriesTable.path_index.name}`,
                ),
              },
            });
        }
      }
    }

    await tx
      .delete(serviceRevisionPathStationEntriesTable)
      .where(
        notExists(
          tx
            .select()
            .from(servicesNextTable)
            .where(
              eq(
                servicesNextTable.id,
                serviceRevisionPathStationEntriesTable.service_id,
              ),
            ),
        ),
      );
    await tx
      .delete(serviceRevisionsTable)
      .where(
        notExists(
          tx
            .select()
            .from(servicesNextTable)
            .where(eq(servicesNextTable.id, serviceRevisionsTable.service_id)),
        ),
      );
    await tx
      .delete(lineServicesTable)
      .where(
        notExists(
          tx
            .select()
            .from(servicesNextTable)
            .where(eq(servicesNextTable.id, lineServicesTable.service_id)),
        ),
      );
    await tx
      .delete(servicesTable)
      .where(
        notExists(
          tx
            .select()
            .from(servicesNextTable)
            .where(eq(servicesNextTable.id, servicesTable.id)),
        ),
      );
  });
}

/**
 * Issues, evidences, impact events and all impact child tables. For changed issues:
 * remove impact subtree + evidences, reinsert from staging. Then remove issues
 * missing from `issues_next` (with full subtree cleanup).
 */
export type IssueSyncPlan = {
  changedIds: string[];
  orphanIds: string[];
};

export async function getIssueSyncPlan(db: Db): Promise<IssueSyncPlan> {
  const rows = await db
    .select({
      id: issuesNextTable.id,
      nextHash: issuesNextTable.hash,
      liveHash: issuesTable.hash,
    })
    .from(issuesNextTable)
    .leftJoin(issuesTable, eq(issuesNextTable.id, issuesTable.id));

  const orphanIssueRows = await db
    .select({ id: issuesTable.id })
    .from(issuesTable)
    .where(
      notExists(
        db
          .select()
          .from(issuesNextTable)
          .where(eq(issuesNextTable.id, issuesTable.id)),
      ),
    );

  return {
    changedIds: rows
      .filter((r) => r.liveHash == null || r.liveHash !== r.nextHash)
      .map((r) => r.id),
    orphanIds: orphanIssueRows.map((r) => r.id),
  };
}

export async function deleteIssueOrphans(
  db: Db,
  issueIds: string[],
): Promise<void> {
  for (const ch of chunk(issueIds, BATCH)) {
    await db.transaction(async (tx) => {
      await deleteIssuesSubtree(tx, ch);
    });
  }
}

export async function syncIssueBatch(
  db: Db,
  issueIds: string[],
): Promise<void> {
  if (issueIds.length === 0) return;

  await db.transaction(async (tx) => {
    const impactRows = await tx
      .select({ id: impactEventsTable.id })
      .from(impactEventsTable)
      .where(inArray(impactEventsTable.issue_id, issueIds));
    const impactEventIds = impactRows.map((r) => r.id);
    await deleteImpactEventChildren(tx, impactEventIds);
    await tx
      .delete(impactEventsTable)
      .where(inArray(impactEventsTable.issue_id, issueIds));
    await tx
      .delete(evidencesTable)
      .where(inArray(evidencesTable.issue_id, issueIds));

    const full = await tx
      .select()
      .from(issuesNextTable)
      .where(inArray(issuesNextTable.id, issueIds));

    const issueRows: InferInsertModel<typeof issuesTable>[] = [];
    const evidenceRows: InferInsertModel<typeof evidencesTable>[] = [];
    const impactEventRows: InferInsertModel<typeof impactEventsTable>[] = [];
    const basisEvidenceRows: InferInsertModel<
      typeof impactEventBasisEvidencesTable
    >[] = [];
    const entityServiceRows: InferInsertModel<
      typeof impactEventEntityServicesTable
    >[] = [];
    const entityFacilityRows: InferInsertModel<
      typeof impactEventEntityFacilitiesTable
    >[] = [];
    const periodRows: InferInsertModel<typeof impactEventPeriodsTable>[] = [];
    const causeRows: InferInsertModel<typeof impactEventCausesTable>[] = [];
    const serviceScopeRows: InferInsertModel<
      typeof impactEventServiceScopesTable
    >[] = [];
    const serviceEffectRows: InferInsertModel<
      typeof impactEventServiceEffectsTable
    >[] = [];
    const facilityEffectRows: InferInsertModel<
      typeof impactEventFacilityEffectsTable
    >[] = [];

    for (const row of full) {
      issueRows.push({
        id: row.id,
        hash: row.hash,
        type: row.type,
        title: row.title,
        title_meta: row.title_meta,
      });

      if (row.evidences.length > 0) {
        evidenceRows.push(
          ...row.evidences.map((evidence) => {
            return {
              id: evidence.id,
              ts: evidence.ts,
              text: evidence.text,
              type: evidence.type,
              render: evidence.render,
              source_url: evidence.sourceUrl,
              issue_id: row.id,
            } satisfies InferInsertModel<typeof evidencesTable>;
          }),
        );
      }

      const impactEvents = row.impact_events;
      if (impactEvents.length > 0) {
        impactEventRows.push(
          ...impactEvents.map((impactEvent) => {
            return {
              id: impactEvent.id,
              ts: impactEvent.ts,
              type: impactEvent.type,
              issue_id: row.id,
            } satisfies InferInsertModel<typeof impactEventsTable>;
          }),
        );

        // One row per impact event — `basis.evidenceId` is a single id in core schema
        basisEvidenceRows.push(
          ...impactEvents.map((impactEvent) => ({
            impact_event_id: impactEvent.id,
            evidence_id: impactEvent.basis.evidenceId,
          })),
        );

        for (const impactEvent of impactEvents) {
          switch (impactEvent.entity.type) {
            case 'service': {
              entityServiceRows.push({
                impact_event_id: impactEvent.id,
                service_id: impactEvent.entity.serviceId,
              } satisfies InferInsertModel<
                typeof impactEventEntityServicesTable
              >);
              break;
            }
            case 'facility': {
              entityFacilityRows.push({
                impact_event_id: impactEvent.id,
                station_id: impactEvent.entity.stationId,
                kind: impactEvent.entity.kind,
              } satisfies InferInsertModel<
                typeof impactEventEntityFacilitiesTable
              >);
              break;
            }
          }

          switch (impactEvent.type) {
            case 'periods.set': {
              const resolvedPeriodsCanonical = resolvePeriods({
                mode: {
                  kind: 'canonical',
                },
                periods: impactEvent.periods,
                asOf: impactEvent.ts,
              });
              if (resolvedPeriodsCanonical.length > 0) {
                periodRows.push(
                  ...resolvedPeriodsCanonical.map((period, index) => {
                    return {
                      impact_event_id: impactEvent.id,
                      index,
                      start_at: period.startAt,
                      end_at: period.endAt,
                    } satisfies InferInsertModel<
                      typeof impactEventPeriodsTable
                    >;
                  }),
                );
              }
              break;
            }
            case 'causes.set': {
              causeRows.push(
                ...impactEvent.causes.map((cause) => {
                  return {
                    impact_event_id: impactEvent.id,
                    type: cause,
                  } satisfies InferInsertModel<typeof impactEventCausesTable>;
                }),
              );
              break;
            }
            case 'service_scopes.set': {
              if (impactEvent.serviceScopes.length > 0) {
                serviceScopeRows.push(
                  ...impactEvent.serviceScopes.map((serviceScope, index) => {
                    const scopeBase = {
                      impact_event_id: impactEvent.id,
                      type: serviceScope.type,
                      index,
                    };

                    switch (serviceScope.type) {
                      case 'service.point': {
                        return {
                          ...scopeBase,
                          station_id: serviceScope.stationId,
                        } satisfies InferInsertModel<
                          typeof impactEventServiceScopesTable
                        >;
                      }
                      case 'service.segment': {
                        return {
                          ...scopeBase,
                          from_station_id: serviceScope.fromStationId,
                          to_station_id: serviceScope.toStationId,
                        } satisfies InferInsertModel<
                          typeof impactEventServiceScopesTable
                        >;
                      }
                      case 'service.whole': {
                        return scopeBase satisfies InferInsertModel<
                          typeof impactEventServiceScopesTable
                        >;
                      }
                    }

                    return {
                      ...scopeBase,
                    } satisfies InferInsertModel<
                      typeof impactEventServiceScopesTable
                    >;
                  }),
                );
              }
              break;
            }
            case 'service_effects.set': {
              serviceEffectRows.push({
                impact_event_id: impactEvent.id,
                kind: impactEvent.effect.kind,
                duration:
                  impactEvent.effect.kind === 'delay'
                    ? impactEvent.effect.duration
                    : null,
              } satisfies InferInsertModel<
                typeof impactEventServiceEffectsTable
              >);
              break;
            }
            case 'facility_effects.set': {
              facilityEffectRows.push({
                impact_event_id: impactEvent.id,
                kind: impactEvent.effect.kind,
              } satisfies InferInsertModel<
                typeof impactEventFacilityEffectsTable
              >);
              break;
            }
          }
        }
      }
    }

    for (const ch of chunk(issueRows, BATCH)) {
      await tx
        .insert(issuesTable)
        .values(ch)
        .onConflictDoUpdate({
          target: [issuesTable.id],
          set: {
            hash: sql.raw(`excluded.${issuesTable.hash.name}`),
            type: sql.raw(`excluded.${issuesTable.type.name}`),
            title: sql.raw(`excluded.${issuesTable.title.name}`),
            title_meta: sql.raw(`excluded.${issuesTable.title_meta.name}`),
          },
        });
    }
    for (const ch of chunk(evidenceRows, BATCH)) {
      await tx.insert(evidencesTable).values(ch);
    }
    for (const ch of chunk(impactEventRows, BATCH)) {
      await tx
        .insert(impactEventsTable)
        .values(ch)
        .onConflictDoUpdate({
          target: [impactEventsTable.id],
          set: {
            ts: sql.raw(`excluded.${impactEventsTable.ts.name}`),
            type: sql.raw(`excluded.${impactEventsTable.type.name}`),
            issue_id: sql.raw(`excluded.${impactEventsTable.issue_id.name}`),
          },
        });
    }
    for (const ch of chunk(basisEvidenceRows, BATCH)) {
      await tx.insert(impactEventBasisEvidencesTable).values(ch);
    }
    for (const ch of chunk(entityServiceRows, BATCH)) {
      await tx.insert(impactEventEntityServicesTable).values(ch);
    }
    for (const ch of chunk(entityFacilityRows, BATCH)) {
      await tx.insert(impactEventEntityFacilitiesTable).values(ch);
    }
    for (const ch of chunk(periodRows, BATCH)) {
      await tx.insert(impactEventPeriodsTable).values(ch);
    }
    for (const ch of chunk(causeRows, BATCH)) {
      await tx.insert(impactEventCausesTable).values(ch);
    }
    for (const ch of chunk(serviceScopeRows, BATCH)) {
      await tx.insert(impactEventServiceScopesTable).values(ch);
    }
    for (const ch of chunk(serviceEffectRows, BATCH)) {
      await tx.insert(impactEventServiceEffectsTable).values(ch);
    }
    for (const ch of chunk(facilityEffectRows, BATCH)) {
      await tx.insert(impactEventFacilityEffectsTable).values(ch);
    }
  });
}

export async function syncIssues(db: Db): Promise<void> {
  const plan = await getIssueSyncPlan(db);
  await deleteIssueOrphans(db, plan.orphanIds);
  for (const issueIds of chunk(plan.changedIds, BATCH)) {
    await syncIssueBatch(db, issueIds);
  }
}

/** Truncates staging tables and records `manifest_last_pulled_at` in one transaction. */
export async function finalizePull(db: Db): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(
      sql`TRUNCATE ${operatorsNextTable}, ${townsNextTable}, ${landmarksNextTable}, ${linesNextTable}, ${stationsNextTable}, ${servicesNextTable}, ${issuesNextTable} RESTART IDENTITY`,
    );
    await tx
      .insert(metadataTable)
      .values({
        key: 'manifest_last_pulled_at',
        value: new Date().toISOString(),
      })
      .onConflictDoUpdate({
        target: [metadataTable.key],
        set: { value: new Date().toISOString() },
      });
  });
}
