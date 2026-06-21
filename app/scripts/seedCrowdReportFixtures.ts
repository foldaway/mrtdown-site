import { asc, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { DateTime } from 'luxon';
import pg from 'pg';
import {
  crowdReportAbuseEventsTable,
  crowdReportClustersTable,
  crowdReportRateLimitsTable,
  crowdReportsTable,
  linesTable,
  stationCodesTable,
  stationsTable,
} from '../db/schema.js';
import {
  type CrowdReportAbuseContext,
  type CrowdReportSubmission,
  persistAutomoderatedCrowdReport,
} from '../util/crowdReports.js';

const { Pool } = pg;

const FIXTURE_ID_PREFIX = 'fixture-crowd-report';
const FIXTURE_HASH_PREFIX = 'fixture-crowd';
const SG_TIMEZONE = 'Asia/Singapore';

type Db = Parameters<typeof persistAutomoderatedCrowdReport>[0];

type StationCodeRow = {
  lineId: string;
  stationId: string;
  code: string;
};

type SeedContext = {
  lineId: string;
  stationId: string;
  rangeLineId: string;
  rangeStationIds: [string, string];
};

function createIdFactory() {
  let nextId = 1;
  return () => `${FIXTURE_ID_PREFIX}-${String(nextId++).padStart(3, '0')}`;
}

function groupStationsByLine(stationCodes: StationCodeRow[]) {
  const stationIdsByLineId = new Map<string, string[]>();

  for (const stationCode of stationCodes) {
    const stationIds = stationIdsByLineId.get(stationCode.lineId) ?? [];
    if (!stationIds.includes(stationCode.stationId)) {
      stationIds.push(stationCode.stationId);
    }
    stationIdsByLineId.set(stationCode.lineId, stationIds);
  }

  return stationIdsByLineId;
}

function chooseSeedContext(
  lineIds: string[],
  stationIds: string[],
  stationCodes: StationCodeRow[],
): SeedContext {
  if (lineIds.length === 0 || stationIds.length === 0) {
    throw new Error(
      'Crowd report fixtures require existing lines and stations. Run db:seed:fixtures first.',
    );
  }

  const stationIdsByLineId = groupStationsByLine(stationCodes);
  const lineId = lineIds.find((candidateLineId) => {
    const lineStationIds = stationIdsByLineId.get(candidateLineId) ?? [];
    return lineStationIds.length > 0;
  });
  if (lineId == null) {
    throw new Error(
      'Crowd report fixtures require station codes for at least one line. Run db:seed:fixtures first.',
    );
  }

  const lineStationIds = stationIdsByLineId.get(lineId);
  const stationId = lineStationIds?.[0];
  if (stationId == null) {
    throw new Error(
      `Crowd report fixtures require station codes for line ${lineId}. Run db:seed:fixtures first.`,
    );
  }

  const rangeLineId = lineIds.find((candidateLineId) => {
    const candidateStationIds = stationIdsByLineId.get(candidateLineId) ?? [];
    return candidateStationIds.length >= 2;
  });
  if (rangeLineId == null) {
    throw new Error(
      'Crowd report fixtures require one line with at least two mapped stations. Run db:seed:fixtures first.',
    );
  }

  const rangeLineStationIds = stationIdsByLineId.get(rangeLineId);
  if (rangeLineStationIds == null || rangeLineStationIds.length < 2) {
    throw new Error(
      `Crowd report fixtures require at least two mapped stations for line ${rangeLineId}. Run db:seed:fixtures first.`,
    );
  }
  const rangeStationIds = [rangeLineStationIds[0], rangeLineStationIds[1]] as [
    string,
    string,
  ];

  return {
    lineId,
    stationId,
    rangeLineId,
    rangeStationIds,
  };
}

function buildAbuseContext(sourceId: string): CrowdReportAbuseContext {
  return {
    ipHash: `${FIXTURE_HASH_PREFIX}-ip-${sourceId}`,
    userAgentHash: `${FIXTURE_HASH_PREFIX}-ua-${sourceId}`,
    clientFingerprintHash: `${FIXTURE_HASH_PREFIX}-client-${sourceId}`,
    turnstileOutcome: 'fixture',
    turnstileTokenHash: `${FIXTURE_HASH_PREFIX}-turnstile-${sourceId}`,
  };
}

function buildFixtureSubmissions(
  context: SeedContext,
  now = DateTime.now().setZone(SG_TIMEZONE),
) {
  const observedAt = (minutesAgo: number) => {
    const value = now.minus({ minutes: minutesAgo }).toISO();
    if (value == null) {
      throw new Error('Unable to calculate crowd report fixture timestamp');
    }
    return value;
  };

  return [
    {
      sourceId: 'a',
      submission: {
        reportScope: 'station',
        observedAt: observedAt(12),
        lineIds: [context.lineId],
        stationIds: [context.stationId],
        effect: 'delay',
        delayMinutes: 8,
        isStillHappening: true,
      },
    },
    {
      sourceId: 'b',
      submission: {
        reportScope: 'station',
        observedAt: observedAt(10),
        lineIds: [context.lineId],
        stationIds: [context.stationId],
        effect: 'delay',
        delayMinutes: 10,
        isStillHappening: true,
      },
    },
    {
      sourceId: 'c',
      submission: {
        reportScope: 'station',
        observedAt: observedAt(8),
        lineIds: [context.lineId],
        stationIds: [context.stationId],
        effect: 'delay',
        delayMinutes: 12,
        isStillHappening: true,
      },
    },
    {
      sourceId: 'd',
      submission: {
        reportScope: 'line',
        observedAt: observedAt(6),
        lineIds: [context.rangeLineId],
        stationIds: context.rangeStationIds,
        effect: 'skipped-stop',
        isStillHappening: true,
      },
    },
    {
      sourceId: 'e',
      submission: {
        reportScope: 'line',
        observedAt: observedAt(4),
        lineIds: [context.rangeLineId],
        stationIds: context.rangeStationIds,
        effect: 'no-service',
        isStillHappening: true,
      },
    },
  ] satisfies Array<{
    sourceId: string;
    submission: CrowdReportSubmission;
  }>;
}

async function clearExistingSyntheticCrowdReports(db: Db) {
  await db.transaction(async (tx) => {
    await tx
      .update(crowdReportsTable)
      .set({
        cluster_id: null,
        updated_at: sql`now()`,
      })
      .where(
        sql`${crowdReportsTable.id} not like ${`${FIXTURE_ID_PREFIX}-%`} and ${crowdReportsTable.cluster_id} like ${`${FIXTURE_ID_PREFIX}-%`}`,
      );
    await tx
      .delete(crowdReportsTable)
      .where(sql`${crowdReportsTable.id} like ${`${FIXTURE_ID_PREFIX}-%`}`);
    await tx
      .delete(crowdReportClustersTable)
      .where(
        sql`${crowdReportClustersTable.id} like ${`${FIXTURE_ID_PREFIX}-%`}`,
      );
    await tx
      .delete(crowdReportAbuseEventsTable)
      .where(
        sql`${crowdReportAbuseEventsTable.ip_hash} like ${`${FIXTURE_HASH_PREFIX}-%`}`,
      );
    await tx
      .delete(crowdReportRateLimitsTable)
      .where(
        sql`${crowdReportRateLimitsTable.ip_hash} like ${`${FIXTURE_HASH_PREFIX}-%`}`,
      );
  });
}

async function loadSeedContext(db: Db) {
  const [lines, stations, stationCodes] = await Promise.all([
    db
      .select({ id: linesTable.id })
      .from(linesTable)
      .orderBy(asc(linesTable.id)),
    db
      .select({ id: stationsTable.id })
      .from(stationsTable)
      .orderBy(asc(stationsTable.id)),
    db
      .select({
        lineId: stationCodesTable.line_id,
        stationId: stationCodesTable.station_id,
        code: stationCodesTable.code,
      })
      .from(stationCodesTable)
      .orderBy(asc(stationCodesTable.line_id), asc(stationCodesTable.code)),
  ]);

  return chooseSeedContext(
    lines.map((line) => line.id),
    stations.map((station) => station.id),
    stationCodes,
  );
}

async function main(): Promise<void> {
  const { DATABASE_URL } = process.env;
  if (DATABASE_URL == null || DATABASE_URL.length === 0) {
    throw new Error('DATABASE_URL must be set');
  }

  const pool = new Pool({ connectionString: DATABASE_URL });
  const db = drizzle({ client: pool }) as Db;

  try {
    const now = DateTime.now().setZone(SG_TIMEZONE);
    await clearExistingSyntheticCrowdReports(db);
    const seedContext = await loadSeedContext(db);
    const idFactory = createIdFactory();
    const fixtureSubmissions = buildFixtureSubmissions(seedContext, now);

    for (const fixture of fixtureSubmissions) {
      const report = await persistAutomoderatedCrowdReport(
        db,
        fixture.submission,
        buildAbuseContext(fixture.sourceId),
        {
          idFactory,
          now,
          rateLimitPerHour: 100,
        },
      );
      console.log(
        `Seeded synthetic crowd report ${report.id} with status ${report.status}`,
      );
    }

    console.log(
      `Seeded ${fixtureSubmissions.length} synthetic crowd reports using line ${seedContext.lineId} and range line ${seedContext.rangeLineId}`,
    );
  } finally {
    await pool.end();
  }
}

await main();
