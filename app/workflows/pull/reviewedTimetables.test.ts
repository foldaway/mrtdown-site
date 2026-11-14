import { randomUUID } from 'node:crypto';
import { access, mkdtemp, readdir, readFile } from 'node:fs/promises';
import type { Manifest, ScheduledTimetableSourceReview } from '@mrtdown/core';
import { hashBytes, type ScheduledTimetableRollbackOptions } from '@mrtdown/fs';
import type { WorkflowContext } from '@upstash/workflow';
import { drizzle } from 'drizzle-orm/node-postgres';
import { zipSync } from 'fflate';
import { Pool } from 'pg';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { getDb } from '~/db';
import { relations } from '~/db/relations';
import { ZipStore } from '~/helpers/ZipStore';
import {
  COMBINED_DEPARTURE_PROJECTOR_VERSION,
  projectScheduledTimetable,
  SCHEDULED_DEPARTURE_PROJECTOR_VERSION,
} from '~/util/dbQueries/projectScheduledTimetable';
import { queryIndexedScheduledDepartures } from '~/util/dbQueries/queryIndexedScheduledDepartures';
import { retainScheduledTimetable } from '~/util/dbQueries/retainScheduledTimetable';
import { retentionReview } from '~/util/dbQueries/scheduledTimetableRetention.fixture';
import { withSelectedScheduledTimetable } from '~/util/dbQueries/withSelectedScheduledTimetable';
import { combinedTimetableArchiveFixture } from './helpers/combinedTimetableArchive.fixture';
import { fetchArchive } from './helpers/fetchArchive';
import { fetchManifest } from './helpers/fetchManifest';
import {
  getCanonicalManifestFingerprint,
  isCanonicalManifestCurrent,
  MANIFEST_FINGERPRINT_METADATA_KEY,
  recordCanonicalManifestFingerprint,
} from './helpers/manifestFingerprint';
import type { PullParams } from './helpers/pullParams';
import { scheduledTimetableArchiveFixture } from './helpers/scheduledTimetableArchive.fixture';
import { scheduledTimetableCanonicalFixture } from './helpers/scheduledTimetableCanonical.fixture';
import { truncateStagingTables } from './helpers/stagingSync';
import { createValidatedScheduledTimetableCanonicalSnapshot } from './helpers/validateScheduledTimetableCanonicalArchive';
import {
  acquireOrRenewPullWorkflowLease,
  releasePullWorkflowLease,
} from './helpers/workflowLease';
import './index';

const state = vi.hoisted(() => ({
  execute: undefined as
    | undefined
    | ((context: WorkflowContext<PullParams>) => Promise<void>),
  failure: undefined as
    | undefined
    | ((args: { context: WorkflowContext<PullParams> }) => Promise<void>),
  fingerprint: undefined as string | undefined,
}));
vi.mock('node:fs/promises', async (original) => {
  const actual = await original<typeof import('node:fs/promises')>();
  return { ...actual, mkdtemp: vi.fn(actual.mkdtemp) };
});
vi.mock('@upstash/workflow/tanstack', () => ({
  createWorkflow: (
    execute: typeof state.execute,
    options: { failureFunction: typeof state.failure },
  ) => {
    state.execute = execute;
    state.failure = options.failureFunction;
    return {};
  },
}));
vi.mock('@mrtdown/fs', async (original) => ({
  ...(await original<typeof import('@mrtdown/fs')>()),
  MRTDownRepository: class {
    operators = { list: () => [] };
    towns = { list: () => [] };
    landmarks = { list: () => [] };
    lines = { list: () => [] };
    stations = { list: () => [] };
    services = { list: () => [] };
    issues = { list: () => [] };
  },
}));
vi.mock('~/db', () => ({ getDb: vi.fn() }));
vi.mock('./helpers/fetchManifest', () => ({ fetchManifest: vi.fn() }));
vi.mock('./helpers/fetchArchive', () => ({ fetchArchive: vi.fn() }));
vi.mock(
  './helpers/validateScheduledTimetableCanonicalArchive',
  async (original) => {
    const actual =
      await original<
        typeof import('./helpers/validateScheduledTimetableCanonicalArchive')
      >();
    return {
      createValidatedScheduledTimetableCanonicalSnapshot: vi.fn(
        actual.createValidatedScheduledTimetableCanonicalSnapshot,
      ),
    };
  },
);
vi.mock('./helpers/workflowLease', () => ({
  acquireOrRenewPullWorkflowLease: vi.fn(async () => true),
  releasePullWorkflowLease: vi.fn(async () => {}),
}));
vi.mock('./helpers/manifestFingerprint', async (original) => ({
  ...(await original<typeof import('./helpers/manifestFingerprint')>()),
  isCanonicalManifestCurrent: vi.fn(
    async (_db, hash) => state.fingerprint === hash,
  ),
  recordCanonicalManifestFingerprint: vi.fn(async (_db, hash) => {
    state.fingerprint = hash;
  }),
}));
vi.mock('./helpers/stagingSync', async (original) =>
  Object.fromEntries(
    Object.keys(await original<typeof import('./helpers/stagingSync')>()).map(
      (name) => [name, vi.fn(async () => 0)],
    ),
  ),
);
vi.mock('~/util/dbQueries/retainScheduledTimetable', async (original) => {
  const actual =
    await original<
      typeof import('~/util/dbQueries/retainScheduledTimetable')
    >();
  return {
    ...actual,
    retainScheduledTimetable: vi.fn(actual.retainScheduledTimetable),
  };
});
vi.mock('~/util/dbQueries/projectScheduledTimetable', async (original) => {
  const actual =
    await original<
      typeof import('~/util/dbQueries/projectScheduledTimetable')
    >();
  return {
    ...actual,
    projectScheduledTimetable: vi.fn(actual.projectScheduledTimetable),
  };
});
vi.mock('~/util/dbQueries/operationalFacts', () => ({
  rebuildOperationalFactsRange: vi.fn(async () => []),
}));
vi.mock('~/util/dbQueries/statistics', () => ({
  rebuildStatisticsSnapshot: vi.fn(async () => ({
    asOf: 'test',
    issueIdsDisruptionLongest: [],
  })),
}));
vi.mock('~/util/dbQueries/sitemap', () => ({
  rebuildSitemapSnapshot: vi.fn(async () => ({
    asOf: 'test',
    pathEntityCount: 0,
  })),
}));
vi.mock('~/util/cloudflareCache', () => ({
  purgePublicDataCache: vi.fn(async () => {}),
}));

const canonical = scheduledTimetableCanonicalFixture();
const allocation = {
  topology: canonical.topology(),
  pattern: canonical.pattern,
};
const baseline = scheduledTimetableArchiveFixture('a', allocation);
const baselineTopologyHash = JSON.parse(
  Buffer.from(baseline.files['manifest.json']).toString(),
).identity.topology.sha256;
const successor = scheduledTimetableArchiveFixture('b', allocation);
const combined = combinedTimetableArchiveFixture();
const manifest: Manifest = {
  manifestVersion: 2,
  generatedAt: '2026-10-24T00:00:00Z',
  lines: {},
  stations: {},
  towns: {},
  landmarks: {},
  operators: {},
  services: {},
  issues: {},
  rights: { licenseData: 'test', sourceRegistry: 'test' },
};
function advertise(bundle = baseline, snapshot = canonical.archive()) {
  vi.mocked(fetchManifest).mockResolvedValue({
    ...snapshot.manifest,
    scheduledTimetable: bundle.entry,
  });
  vi.mocked(fetchArchive).mockResolvedValue(
    Buffer.from(
      zipSync({
        ...snapshot.files,
        ...Object.fromEntries(
          Object.entries(bundle.files).map(([name, bytes]) => [
            `data/scheduled-timetable/${name}`,
            bytes,
          ]),
        ),
      }),
    ),
  );
}
function advertiseCombined({
  snapshot = combined.snapshot,
  releaseBytes = combined.files.releaseBytes,
} = {}) {
  vi.mocked(fetchManifest).mockResolvedValue(snapshot.manifest);
  vi.mocked(fetchArchive).mockResolvedValue(
    Buffer.from(
      zipSync({
        ...snapshot.files,
        'data/combined-timetable/manifest.json': combined.files.manifestBytes,
        'data/combined-timetable/timetable.json': combined.files.timetableBytes,
        'data/combined-timetable/release.json': releaseBytes,
        'data/combined-timetable/release-index.json': Buffer.from(
          JSON.stringify(combined.index),
        ),
      }),
    ),
  );
}
function workflow(requestPayload?: unknown) {
  const outputs = new Map<string, unknown>();
  const context = {
    requestPayload,
    workflowRunId: randomUUID(),
    run: vi.fn(async (name: string, callback: () => Promise<unknown>) => {
      if (!outputs.has(name)) {
        const value = await callback();
        // Simulate the durable JSON handoff; no timetable bytes belong here.
        outputs.set(
          name,
          value === undefined ? undefined : JSON.parse(JSON.stringify(value)),
        );
      }
      return outputs.get(name);
    }),
  } as unknown as WorkflowContext<PullParams>;
  const execute = state.execute;
  if (!execute) {
    throw new Error('Workflow was not registered');
  }
  return { outputs, context, run: () => execute(context) };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('MRTDOWN_DATA_URL', 'https://data.example.com');
  vi.stubEnv('MRTDOWN_COMBINED_RELEASE_INDEX', undefined);
  state.fingerprint = undefined;
  vi.mocked(getDb).mockReturnValue({} as ReturnType<typeof getDb>);
  vi.mocked(fetchManifest).mockResolvedValue(manifest);
  vi.mocked(fetchArchive).mockResolvedValue(Buffer.from(zipSync({})));
});
afterEach(async () => {
  vi.unstubAllEnvs();
  for (const result of vi.mocked(mkdtemp).mock.results) {
    await expect(access(await result.value)).rejects.toMatchObject({
      code: 'ENOENT',
    });
  }
});

describe('pull timetable admission', () => {
  it('requires a trusted index even when the combined archive contains its own index', async () => {
    advertiseCombined();
    await expect(workflow().run()).rejects.toThrow(
      'independently trusted release index',
    );
    expect(truncateStagingTables).not.toHaveBeenCalled();
  });

  it('rejects changed evidence and a different canonical topology before staging', async () => {
    const payload = { combinedReleaseIndex: combined.index };
    advertiseCombined({ releaseBytes: Buffer.from('{}') });
    await expect(workflow(payload).run()).rejects.toThrow('expected SHA-256');
    advertiseCombined({ snapshot: canonical.archive() });
    await expect(workflow(payload).run()).rejects.toThrow(
      'topology differs from canonical data',
    );
    expect(truncateStagingTables).not.toHaveBeenCalled();
    expect(recordCanonicalManifestFingerprint).not.toHaveBeenCalled();
  });

  it.each(['manifestSha256', 'releaseSha256'] as const)(
    'rejects a requested index with a different %s even if the pull could skip',
    async (field) => {
      advertiseCombined();
      vi.stubEnv(
        'MRTDOWN_COMBINED_RELEASE_INDEX',
        JSON.stringify(combined.index),
      );
      state.fingerprint = getCanonicalManifestFingerprint(
        combined.snapshot.manifest,
        combined.index,
      );
      await expect(
        workflow({
          combinedReleaseIndex: { ...combined.index, [field]: '0'.repeat(64) },
        }).run(),
      ).rejects.toThrow('differs from MRTDOWN_COMBINED_RELEASE_INDEX');
      expect(fetchManifest).not.toHaveBeenCalled();
      expect(fetchArchive).not.toHaveBeenCalled();
    },
  );

  it('rejects invalid deployment pins without falling back to a signed index', async () => {
    vi.stubEnv('MRTDOWN_COMBINED_RELEASE_INDEX', '{}');
    await expect(
      workflow({ combinedReleaseIndex: combined.index }).run(),
    ).rejects.toThrow('Invalid MRTDOWN_COMBINED_RELEASE_INDEX');
    expect(fetchManifest).not.toHaveBeenCalled();
  });

  it('keeps the original pin across callbacks and checks a rotated pin despite unchanged canonical data', async () => {
    advertiseCombined();
    vi.stubEnv(
      'MRTDOWN_COMBINED_RELEASE_INDEX',
      JSON.stringify(combined.index),
    );
    state.fingerprint = getCanonicalManifestFingerprint(
      combined.snapshot.manifest,
    );
    const pull = workflow('');
    vi.mocked(fetchArchive).mockRejectedValueOnce(new Error('download failed'));
    await expect(pull.run()).rejects.toThrow('download failed');

    const releaseBytes = Buffer.concat([
      combined.files.releaseBytes,
      Buffer.from('\n'),
    ]);
    const rotated = {
      ...combined.index,
      releaseSha256: hashBytes(releaseBytes),
    };
    vi.stubEnv('MRTDOWN_COMBINED_RELEASE_INDEX', JSON.stringify(rotated));
    advertiseCombined({ releaseBytes });
    await expect(pull.run()).rejects.toThrow('expected SHA-256');
    expect(fetchManifest).toHaveBeenCalledOnce();

    // A new run sees the deployment pin. Even a successful old combined
    // fingerprint cannot make a stale archive acceptable after rotation.
    advertiseCombined();
    state.fingerprint = getCanonicalManifestFingerprint(
      combined.snapshot.manifest,
      combined.index,
    );
    await expect(workflow('').run()).rejects.toThrow('expected SHA-256');
    expect(fetchManifest).toHaveBeenCalledTimes(2);
    expect(truncateStagingTables).not.toHaveBeenCalled();
    expect(recordCanonicalManifestFingerprint).not.toHaveBeenCalled();
  });

  it.each([undefined, '', {}])(
    'keeps empty GTFS-free pulls working: %s',
    async (payload) => {
      const pull = workflow(payload);
      await pull.run();
      expect(truncateStagingTables).toHaveBeenCalledOnce();
      expect(retainScheduledTimetable).not.toHaveBeenCalled();
      expect(projectScheduledTimetable).not.toHaveBeenCalled();
      expect(
        createValidatedScheduledTimetableCanonicalSnapshot,
      ).not.toHaveBeenCalled();
      expect(mkdtemp).not.toHaveBeenCalled();
      expect(recordCanonicalManifestFingerprint).toHaveBeenCalledOnce();
      expect(releasePullWorkflowLease).toHaveBeenCalledWith(
        expect.anything(),
        pull.context.workflowRunId,
      );
      await workflow().run();
      expect(fetchArchive).toHaveBeenCalledOnce();
    },
  );

  it('rejects invalid signed payloads before acquiring a lease', async () => {
    await expect(workflow({ sourceReview: {} }).run()).rejects.toThrow(
      'Invalid canonical pull request',
    );
    expect(acquireOrRenewPullWorkflowLease).not.toHaveBeenCalled();
  });

  it('rejects an advertised incomplete bundle before staging or recording success', async () => {
    advertise();
    vi.mocked(fetchArchive).mockResolvedValue(Buffer.from(zipSync({})));
    const pull = workflow({ sourceReview: retentionReview(baseline) });
    await expect(pull.run()).rejects.toThrow('ENOENT');
    expect(truncateStagingTables).not.toHaveBeenCalled();
    expect(recordCanonicalManifestFingerprint).not.toHaveBeenCalled();
    expect(retainScheduledTimetable).not.toHaveBeenCalled();
    expect(projectScheduledTimetable).not.toHaveBeenCalled();
    await state.failure?.({ context: pull.context });
    expect(releasePullWorkflowLease).toHaveBeenCalledWith(
      expect.anything(),
      pull.context.workflowRunId,
    );
  });

  it.each([
    ['topology', 'topology fingerprint'],
    ['root hash', 'differs from root manifest'],
    ['file set', 'files differ from root manifest'],
    ['path', 'ordered path'],
    ['platform', 'boarding status'],
    ['date', 'inactive on 2026-10-24'],
  ])(
    'rejects incompatible %s before retention or staging',
    async (kind, message) => {
      const fixture = scheduledTimetableCanonicalFixture();
      if (kind === 'topology' || kind === 'root hash') {
        fixture.canonical.lines[0].serviceIds.push('other-service');
      } else if (kind === 'path') {
        fixture.canonical.services[0].revisions[0].path.stations.reverse();
      } else if (kind === 'platform') {
        const platform = fixture.canonical.stations[0].layout?.platforms?.[0];
        if (!platform) {
          throw new Error('Missing fixture platform');
        }
        platform.boardingStatus = 'not_in_service';
      } else if (kind === 'date') {
        fixture.canonical.services[0].revisions[0].startAt = '2026-10-25';
      }
      const snapshot = fixture.archive();
      if (kind === 'root hash') {
        snapshot.manifest = canonical.archive().manifest;
      } else if (kind === 'file set') {
        snapshot.files['data/line/extra.json'] =
          snapshot.files['data/line/line.json'];
      }
      const bundle =
        kind === 'topology' || kind === 'root hash' || kind === 'file set'
          ? baseline
          : scheduledTimetableArchiveFixture('a', {
              topology: fixture.topology(),
              pattern: fixture.pattern,
            });
      advertise(bundle, snapshot);
      await expect(
        workflow({ sourceReview: retentionReview(bundle) }).run(),
      ).rejects.toThrow(message);
      expect(retainScheduledTimetable).not.toHaveBeenCalled();
      expect(projectScheduledTimetable).not.toHaveBeenCalled();
      expect(truncateStagingTables).not.toHaveBeenCalled();
      expect(recordCanonicalManifestFingerprint).not.toHaveBeenCalled();
    },
  );
});

const url = process.env.TEST_TIMETABLE_DATABASE_URL;
const schema = `gtfs_pull_test_${randomUUID().replaceAll('-', '')}`;
describe.skipIf(!url)('pull PostgreSQL admission and projection', () => {
  let admin: Pool;
  let pool: Pool;
  beforeAll(async () => {
    admin = new Pool({ connectionString: url });
    await admin.query(`CREATE SCHEMA ${schema}`);
    pool = new Pool({
      connectionString: url,
      options: `-c search_path=${schema},public`,
    });
    const migrations = new URL('../../../drizzle/', import.meta.url);
    for (const migration of (await readdir(migrations, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map(({ name }) => name)
      .sort()) {
      const sql = await readFile(
        new URL(`${migration}/migration.sql`, migrations),
        'utf8',
      );
      await pool.query(sql.replaceAll('"public".', `"${schema}".`));
    }
  });
  beforeEach(async () => {
    await pool.query('TRUNCATE scheduled_timetables CASCADE');
    vi.mocked(getDb).mockReturnValue(drizzle({ client: pool, relations }));
    advertise();
  });
  afterAll(async () => {
    await pool?.end();
    if (admin) {
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await admin.end();
    }
  });
  const rows = async () =>
    (
      await pool.query(
        'SELECT * FROM scheduled_timetables ORDER BY manifest_sha256',
      )
    ).rows;

  const projections = async () =>
    (
      await pool.query(
        'SELECT * FROM scheduled_departure_projections ORDER BY manifest_sha256',
      )
    ).rows;

  it('finishes an empty signed pull using the pinned, previously projected release without rewriting departures', async () => {
    advertiseCombined();
    vi.stubEnv(
      'MRTDOWN_COMBINED_RELEASE_INDEX',
      JSON.stringify(combined.index),
    );
    await expect(workflow('').run()).rejects.toThrow('source-review-required');
    expect(await rows()).toEqual([]);

    const sourceReview: ScheduledTimetableSourceReview = {
      ...retentionReview(baseline),
      successor: {
        manifestSha256: combined.index.manifestSha256,
        snapshotSha256: combined.capture.sha256,
      },
      reviewedAt: '2026-11-03T00:00:00Z',
    };
    vi.mocked(truncateStagingTables).mockRejectedValueOnce(
      new Error('callback did not finish'),
    );
    await expect(
      workflow({ combinedReleaseIndex: combined.index, sourceReview }).run(),
    ).rejects.toThrow('callback did not finish');
    const retained = await rows();
    const completed = await projections();
    expect(completed).toHaveLength(1);
    expect(completed[0].completed_at).not.toBeNull();
    expect(state.fingerprint).toBeUndefined();

    const tables = [
      'combined_departure_occurrences',
      'combined_departure_memberships',
    ];
    await pool.query(`CREATE FUNCTION reject_departure_write()
      RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        RAISE EXCEPTION 'unexpected departure rewrite';
      END $$`);
    for (const table of tables) {
      await pool.query(`CREATE TRIGGER reject_departure_write
        BEFORE INSERT OR UPDATE OR DELETE ON ${table}
        FOR EACH STATEMENT EXECUTE FUNCTION reject_departure_write()`);
    }
    const actual = await vi.importActual<
      typeof import('./helpers/manifestFingerprint')
    >('./helpers/manifestFingerprint');
    vi.mocked(recordCanonicalManifestFingerprint).mockImplementationOnce(
      actual.recordCanonicalManifestFingerprint,
    );
    const replay = workflow('');
    try {
      await replay.run();
    } finally {
      await pool.query('DROP FUNCTION reject_departure_write() CASCADE');
    }
    expect(await rows()).toEqual(retained);
    expect(await projections()).toEqual(completed);
    expect(replay.outputs.has('release-pull-lease')).toBe(true);
    const fingerprint = getCanonicalManifestFingerprint(
      combined.snapshot.manifest,
      combined.index,
    );
    expect(await actual.isCanonicalManifestCurrent(getDb(), fingerprint)).toBe(
      true,
    );

    // A second valid release-evidence encoding for the same manifest cannot
    // silently reuse the receipt and projection under a different release pin.
    const releaseBytes = Buffer.concat([
      combined.files.releaseBytes,
      Buffer.from('\n'),
    ]);
    const changedEvidence = {
      ...combined.index,
      releaseSha256: hashBytes(releaseBytes),
    };
    advertiseCombined({ releaseBytes });
    vi.stubEnv(
      'MRTDOWN_COMBINED_RELEASE_INDEX',
      JSON.stringify(changedEvidence),
    );
    await expect(workflow('').run()).rejects.toThrow(
      'retained-combined-release-index-mismatch',
    );
    expect(await projections()).toEqual(completed);
    expect(await rows()).toEqual(retained);
    expect(await actual.isCanonicalManifestCurrent(getDb(), fingerprint)).toBe(
      true,
    );
    await pool.query('DELETE FROM metadata WHERE key = $1', [
      MANIFEST_FINGERPRINT_METADATA_KEY,
    ]);
  });

  it('indexes an admitted combined successor against live topology and retains the legacy rollback target', async () => {
    const legacy = scheduledTimetableArchiveFixture('a', {
      topology: combined.topology,
      pattern: combined.canonical.pattern,
      customize(timetable, metadata) {
        const date = '2026-11-30';
        metadata.feedRange = { startDate: date, endDate: date };
        metadata.sourceFeedInfo[0].feed_start_date = '20261130';
        metadata.sourceFeedInfo[0].feed_end_date = '20261130';
        timetable.timetable.calendars[0].exceptions[0].date = date;
        timetable.assignments[0].dateRanges = [metadata.feedRange];
      },
    });
    advertise(legacy, combined.snapshot);
    await workflow({ sourceReview: retentionReview(legacy) }).run();
    const first = await rows();
    const [legacyProjection] = await projections();

    advertiseCombined();
    const combinedReleaseIndex = combined.index;
    await expect(workflow({ combinedReleaseIndex }).run()).rejects.toThrow(
      'source-review-required',
    );
    expect(await rows()).toEqual(first);

    const sourceReview: ScheduledTimetableSourceReview = {
      ...retentionReview(successor, legacy),
      successor: {
        manifestSha256: combined.index.manifestSha256,
        snapshotSha256: combined.capture.sha256,
      },
      reviewedAt: '2026-11-03T00:00:00Z',
    };
    await workflow({ combinedReleaseIndex, sourceReview }).run();
    const retained = await rows();
    expect(retained).toHaveLength(2);
    const row = retained.find(
      ({ manifest_sha256 }) =>
        manifest_sha256 === combined.index.manifestSha256,
    );
    expect(row).toMatchObject({
      predecessor_sha256: legacy.entry.manifestSha256,
      combined_release: { index: combined.index },
      manifest_bytes: combined.files.manifestBytes,
      timetable_bytes: combined.files.timetableBytes,
      release_bytes: combined.files.releaseBytes,
      pages_entry: null,
      notice_bytes: null,
      import_record: { sourceReview },
    });
    const projected = await projections();
    expect(projected).toContainEqual(legacyProjection);
    const projection = projected.find(
      (row) => row.manifest_sha256 === combined.index.manifestSha256,
    );
    expect(projection).toMatchObject({
      projector_version: COMBINED_DEPARTURE_PROJECTOR_VERSION,
      maximum_departure_seconds: '90060',
    });
    expect(projection.completed_at).not.toBeNull();
    expect(
      (
        await pool.query(
          'SELECT stop_sequence FROM combined_departure_occurrences ORDER BY occurrence_index',
        )
      ).rows,
    ).toEqual(
      combined.sequences
        .slice(0, 3)
        .map((stop_sequence) => ({ stop_sequence })),
    );
    expect(
      (
        await pool.query(
          'SELECT platform_ids FROM combined_departure_memberships ORDER BY service_id, stop_sequence',
        )
      ).rows,
    ).toHaveLength(6);

    // Promote the synthetic archive into the isolated live schema. The
    // workflow harness mocks staging; the reader uses its real default loader.
    const staging = await vi.importActual<
      typeof import('./helpers/stagingSync')
    >('./helpers/stagingSync');
    const database = getDb();
    const { operators, lines, stations, services } =
      combined.canonical.canonical;
    const hashed = <T extends { id: string }>(entities: T[]) =>
      entities.map((entity) => ({
        ...entity,
        hash: hashBytes(Buffer.from(JSON.stringify(entity))),
      }));
    await staging.insertOperatorsStaging(database, hashed(operators));
    await staging.insertTownsStaging(
      database,
      hashed([{ id: 'town', name: operators[0].name }]),
    );
    const stagedLines = await staging.insertLinesStaging(
      database,
      hashed(lines),
    );
    await staging.insertStationsStaging(database, hashed(stations));
    await staging.insertServicesStaging(database, hashed(services));
    await staging.syncOperatorsTownsLandmarksUpserts(database);
    await staging.syncLines(database);
    await staging.syncStations(database);
    await staging.syncServices(database);
    await staging.syncStationPlatformServices(database);
    await staging.finalizePull(database, {
      canonicalTopologyComplete: stagedLines === lines.length,
    });

    const scope = {
      stationId: 'station-1',
      lineId: 'line',
      destinationStationId: 'station-2',
    };
    const multi = { ...scope, serviceIds: ['service-shared', 'service'] };
    const exact = { ...scope, serviceId: 'service' };
    const window = {
      startInstant: '2026-12-01T00:59:59+08:00',
      endInstant: '2026-12-01T01:00:01+08:00',
    };
    const selectDate = (serviceDate: string) =>
      withSelectedScheduledTimetable(
        database,
        { scope: multi, serviceDate },
        async (_tx, selection) => selection,
      );
    const empty = await selectDate('2026-11-29');
    expect(empty.selected?.coverage).toMatchObject({ activeTripCount: 0 });
    expect((await selectDate('2026-11-28')).attempts[0].reason).toBe(
      'outside-feed-range',
    );
    expect((await selectDate('2026-12-01')).attempts[0].reason).toBe(
      'outside-feed-range',
    );

    expect(
      await queryIndexedScheduledDepartures(database, {
        startInstant: '2026-11-29T12:00:00+08:00',
        endInstant: '2026-11-29T13:00:00+08:00',
        scope: multi,
      }),
    ).toMatchObject({
      complete: true,
      untimedDepartureCount: 0,
      departures: [],
    });

    const overnight = await queryIndexedScheduledDepartures(database, {
      ...window,
      scope: multi,
    });
    expect(overnight.untimedDepartureCount).toBe(1);
    expect(overnight.departures).toMatchObject([
      {
        manifestSha256: combined.index.manifestSha256,
        providerTripId: 'trip',
        stopSequence: combined.sequences[0],
        serviceDate: '2026-11-30',
        departureSeconds: 90_000,
        departureInstant: '2026-11-30T17:00:00Z',
        precision: 'exact',
        platformSemantics: 'distinct-platform-associations',
        platformIds: ['platform-1', 'platform-shared'],
        boardingByService: [
          {
            serviceId: 'service',
            revisionId: 'revision',
            platformIds: ['platform-1'],
          },
          {
            serviceId: 'service-shared',
            revisionId: 'shared-revision',
            platformIds: ['platform-1', 'platform-shared'],
          },
        ],
      },
      {
        stopSequence: combined.sequences[1],
        precision: 'approximate',
        platformSemantics: 'complete-source-alternatives',
        platformIds: ['platform-common'],
      },
    ]);
    const common = await queryIndexedScheduledDepartures(database, {
      ...window,
      scope: { ...multi, platformId: 'platform-common' },
    });
    expect(common.departures.map(({ stopSequence }) => stopSequence)).toEqual([
      combined.sequences[1],
    ]);
    expect(common.untimedDepartureCount).toBe(1);
    const single = await queryIndexedScheduledDepartures(database, {
      ...window,
      scope: { ...exact, platformId: 'platform-1' },
    });
    expect(
      single.departures.map(({ serviceId, stopSequence }) => [
        serviceId,
        stopSequence,
      ]),
    ).toEqual([['service', combined.sequences[0]]]);
    expect(single.untimedDepartureCount).toBe(0);
    const reviewed = await queryIndexedScheduledDepartures(database, {
      ...window,
      scope: {
        ...scope,
        serviceId: 'service-shared',
        platformId: 'platform-1',
      },
    });
    expect(reviewed.departures).toMatchObject([
      { serviceId: 'service-shared', stopSequence: combined.sequences[0] },
    ]);
    await expect(
      queryIndexedScheduledDepartures(database, {
        ...window,
        scope: { ...exact, platformId: 'platform-shared' },
      }),
    ).rejects.toThrow('Timetable request platform does not belong');

    expect(
      (
        await queryIndexedScheduledDepartures(database, {
          ...window,
          scope: { ...multi, platformId: 'platform-closed' },
        })
      ).departures,
    ).toEqual([]);

    const exactSelection = (rollback?: ScheduledTimetableRollbackOptions) =>
      withSelectedScheduledTimetable(
        database,
        {
          scope: exact,
          serviceDate: '2026-11-30',
          rollback,
        },
        async (_tx, selection) => selection,
      );
    expect((await exactSelection()).selected?.version.format).toBe('combined');
    const rollback: ScheduledTimetableRollbackOptions = {
      selectionInstant: row.import_record.importInstant,
      review: {
        schemaVersion: 1,
        documentKind: 'scheduled-timetable-rollback-review',
        from: sourceReview.successor,
        to: {
          manifestSha256: legacy.entry.manifestSha256,
          snapshotSha256: legacy.entry.capture.sha256,
        },
        dateRange: { startDate: '2026-11-30', endDate: '2026-11-30' },
        scope: exact,
        reviewedAt: row.import_record.importInstant,
        reviewer: 'Synthetic rollback reviewer',
        reason: 'Verify legacy rollback',
      },
    };
    expect(await exactSelection(rollback)).toMatchObject({
      selected: { version: { format: 'legacy' } },
      rollback: { status: 'applied' },
    });

    const multiRollback = await withSelectedScheduledTimetable(
      database,
      {
        scope: multi,
        serviceDate: '2026-11-30',
        rollback: { ...rollback, review: { ...rollback.review, scope: multi } },
      },
      async (_tx, selection) => selection,
    );
    expect(multiRollback).toMatchObject({
      selected: null,
      rollback: {
        status: 'rejected',
        blockers: ['rollback-target-is-not-eligible'],
      },
    });

    await pool.query(
      'DELETE FROM scheduled_departure_days WHERE projection_id = $1 AND service_date = $2',
      [projection.id, '2026-11-30'],
    );
    expect((await selectDate('2026-11-30')).attempts[0].reason).toBe(
      'day-not-indexed',
    );

    state.fingerprint = undefined;
    await workflow({ combinedReleaseIndex }).run();
    expect(await rows()).toEqual(retained);
    expect((await selectDate('2026-11-30')).selected?.projectionId).toBe(
      projection.id,
    );
    // An intentional rebuild bypasses even the successful same-input fingerprint.
    await pool.query(
      "UPDATE scheduled_departure_projections SET completed_at = '2000-01-01 00:00:00+00' WHERE id = $1",
      [projection.id],
    );
    const beforeRebuild = await projections();
    await workflow({
      combinedReleaseIndex,
      rebuildScheduledTimetableProjection: true,
    }).run();
    expect(await projections()).not.toEqual(beforeRebuild);
    expect((await selectDate('2026-11-30')).selected?.projectionId).toBe(
      projection.id,
    );
    await pool.query(
      "UPDATE station_platforms SET label = 'Different canonical label' WHERE platform_id = 'platform-1'",
    );
    expect((await selectDate('2026-11-30')).attempts[0].reason).toBe(
      'topology-mismatch',
    );
    await pool.query(
      "UPDATE station_platforms SET label = 'A' WHERE platform_id = 'platform-1'",
    );

    const snapshot = await createValidatedScheduledTimetableCanonicalSnapshot(
      combined.snapshot.manifest,
      new ZipStore(Buffer.from(zipSync(combined.snapshot.files))),
    );
    try {
      await pool.query(
        'UPDATE scheduled_timetables SET release_bytes = $1 WHERE manifest_sha256 = $2',
        [
          Buffer.alloc(combined.files.releaseBytes.length),
          combined.index.manifestSha256,
        ],
      );
      await expect(
        projectScheduledTimetable(database, {
          manifestSha256: combined.index.manifestSha256,
          projectorVersion: COMBINED_DEPARTURE_PROJECTOR_VERSION,
          canonicalDataDir: snapshot.canonicalDataDir,
        }),
      ).rejects.toThrow('expected SHA-256');
      expect(await exactSelection()).toMatchObject({
        selected: { version: { format: 'legacy' } },
        attempts: [{ reason: 'projection-incomplete' }, { reason: 'eligible' }],
      });
    } finally {
      await snapshot.dispose();
    }
  });

  it('projects before staging, replays admission and preserves historical projections', async () => {
    const pull = workflow({ sourceReview: retentionReview(baseline) });
    await pull.run();
    const first = await rows();
    const [projection] = await projections();
    expect(projection).toMatchObject({
      manifest_sha256: baseline.entry.manifestSha256,
      projector_version: SCHEDULED_DEPARTURE_PROJECTOR_VERSION,
      topology_sha256: baselineTopologyHash,
    });
    expect(projection.completed_at).not.toBeNull();
    expect(
      (await pool.query('SELECT * FROM scheduled_departure_days')).rows,
    ).toHaveLength(1);
    expect(
      (await pool.query('SELECT * FROM scheduled_departure_scopes')).rows,
    ).toHaveLength(1);
    expect(
      (await pool.query('SELECT * FROM scheduled_departure_occurrences')).rows,
    ).toHaveLength(1);
    expect(
      vi.mocked(projectScheduledTimetable).mock.invocationCallOrder[0],
    ).toBeLessThan(
      vi.mocked(truncateStagingTables).mock.invocationCallOrder[0],
    );
    expect(first).toHaveLength(1);
    expect(first[0].import_record.importInstant).toBe(
      (pull.outputs.get('manifest') as { importInstant: string }).importInstant,
    );
    expect(first[0].timetable_bytes).toEqual(baseline.files['timetable.json']);
    expect(
      [...pull.outputs.values()].every(
        (value) => JSON.stringify(value ?? null).length < 10_000,
      ),
    ).toBe(true);
    await workflow().run();
    expect(fetchArchive).toHaveBeenCalledOnce();
    expect(projectScheduledTimetable).toHaveBeenCalledOnce();
    // Force another parse (e.g. a pipeline rebuild) without a fresh review.
    state.fingerprint = undefined;
    await workflow().run();
    expect(await rows()).toEqual(first);
    expect(retainScheduledTimetable).toHaveBeenCalledTimes(2);
    const [reused] = await projections();
    expect(reused).toEqual(projection);
    advertise(successor);
    await workflow({
      sourceReview: retentionReview(successor, baseline),
    }).run();
    expect(await rows()).toHaveLength(2);
    expect(await projections()).toHaveLength(2);
    expect(await projections()).toContainEqual(reused);
    expect(projectScheduledTimetable).toHaveBeenCalledTimes(3);
    expect(fetchArchive).toHaveBeenCalledTimes(3);
    expect(truncateStagingTables).toHaveBeenCalledTimes(3);
  });

  it('blocks missing or wrong source review while preserving retained data and the successful fingerprint', async () => {
    await workflow({ sourceReview: retentionReview(baseline) }).run();
    const first = await rows();
    const previousProjections = await projections();
    const fingerprint = state.fingerprint;
    vi.clearAllMocks();
    advertise(successor);
    for (const sourceReview of [
      undefined,
      retentionReview(baseline),
      retentionReview(successor),
    ]) {
      await expect(workflow({ sourceReview }).run()).rejects.toThrow(
        /retention blocked: source-review-(required|mismatch)/,
      );
      expect(await rows()).toEqual(first);
    }
    expect(await projections()).toEqual(previousProjections);
    expect(state.fingerprint).toBe(fingerprint);
    expect(projectScheduledTimetable).not.toHaveBeenCalled();
    expect(truncateStagingTables).not.toHaveBeenCalled();
    expect(recordCanonicalManifestFingerprint).not.toHaveBeenCalled();
  });

  it('revalidates retained history against changed canonical data without rewriting rows or success', async () => {
    await workflow({ sourceReview: retentionReview(baseline) }).run();
    const first = await rows();
    const previousProjections = await projections();
    const fingerprint = state.fingerprint;
    vi.clearAllMocks();
    const changed = scheduledTimetableCanonicalFixture();
    changed.canonical.lines[0].serviceIds.push('other-service');
    advertise(baseline, changed.archive());
    await expect(workflow().run()).rejects.toThrow('topology fingerprint');
    expect(await rows()).toEqual(first);
    expect(await projections()).toEqual(previousProjections);
    expect(state.fingerprint).toBe(fingerprint);
    expect(retainScheduledTimetable).not.toHaveBeenCalled();
    expect(projectScheduledTimetable).not.toHaveBeenCalled();
    expect(truncateStagingTables).not.toHaveBeenCalled();
    expect(recordCanonicalManifestFingerprint).not.toHaveBeenCalled();
  });

  it('lets an ordinary pull repair a failed explicit rebuild of a current manifest', async () => {
    const actual = await vi.importActual<
      typeof import('./helpers/manifestFingerprint')
    >('./helpers/manifestFingerprint');
    const fingerprint = getCanonicalManifestFingerprint({
      ...canonical.archive().manifest,
      scheduledTimetable: baseline.entry,
    });
    vi.mocked(recordCanonicalManifestFingerprint).mockImplementationOnce(
      actual.recordCanonicalManifestFingerprint,
    );
    await workflow({ sourceReview: retentionReview(baseline) }).run();
    expect(await actual.isCanonicalManifestCurrent(getDb(), fingerprint)).toBe(
      true,
    );
    const [projection] = await projections();

    await pool.query(`ALTER TABLE scheduled_departure_days
      ADD CONSTRAINT synthetic_projection_failure CHECK (active_trip_count = 0) NOT VALID`);
    try {
      vi.mocked(isCanonicalManifestCurrent).mockImplementationOnce(
        actual.isCanonicalManifestCurrent,
      );
      await expect(
        workflow({ rebuildScheduledTimetableProjection: true }).run(),
      ).rejects.toThrow('Failed query');
    } finally {
      await pool.query(`ALTER TABLE scheduled_departure_days
        DROP CONSTRAINT synthetic_projection_failure`);
    }
    expect(await projections()).toEqual([
      { ...projection, completed_at: null },
    ]);
    expect(await actual.isCanonicalManifestCurrent(getDb(), fingerprint)).toBe(
      false,
    );
    expect(recordCanonicalManifestFingerprint).toHaveBeenCalledOnce();

    vi.mocked(isCanonicalManifestCurrent).mockImplementationOnce(
      actual.isCanonicalManifestCurrent,
    );
    vi.mocked(recordCanonicalManifestFingerprint).mockImplementationOnce(
      actual.recordCanonicalManifestFingerprint,
    );
    await workflow().run();
    const [repaired] = await projections();
    expect(repaired.id).toBe(projection.id);
    expect(repaired.completed_at).not.toBeNull();
    expect(await actual.isCanonicalManifestCurrent(getDb(), fingerprint)).toBe(
      true,
    );
    expect(fetchArchive).toHaveBeenCalledTimes(3);
    await pool.query('DELETE FROM metadata WHERE key = $1', [
      MANIFEST_FINGERPRINT_METADATA_KEY,
    ]);
  });

  it('leaves admission replayable after projection failure without staging or recording success', async () => {
    await workflow({ sourceReview: retentionReview(baseline) }).run();
    const previousProjections = await projections();
    const fingerprint = state.fingerprint;
    vi.clearAllMocks();
    advertise(successor);
    await pool.query(`ALTER TABLE scheduled_departure_days
      ADD CONSTRAINT synthetic_projection_failure CHECK (active_trip_count = 0) NOT VALID`);
    const pull = workflow({
      sourceReview: retentionReview(successor, baseline),
    });
    try {
      await expect(pull.run()).rejects.toThrow('Failed query');
    } finally {
      await pool.query(`ALTER TABLE scheduled_departure_days
        DROP CONSTRAINT synthetic_projection_failure`);
    }
    const first = await rows();
    expect(first).toHaveLength(2);
    expect(await projections()).toEqual(previousProjections);
    expect(state.fingerprint).toBe(fingerprint);
    expect(truncateStagingTables).not.toHaveBeenCalled();
    expect(recordCanonicalManifestFingerprint).not.toHaveBeenCalled();
    await state.failure?.({ context: pull.context });
    expect(releasePullWorkflowLease).toHaveBeenCalledWith(
      expect.anything(),
      pull.context.workflowRunId,
    );
    // A fresh invocation has no review, but reuses the committed admission.
    await workflow().run();
    expect(await rows()).toEqual(first);
    const completed = await projections();
    expect(completed).toHaveLength(2);
    expect(completed.every((row) => row.completed_at !== null)).toBe(true);
    expect(truncateStagingTables).toHaveBeenCalledOnce();
    expect(recordCanonicalManifestFingerprint).toHaveBeenCalledOnce();
    expect(fetchArchive).toHaveBeenCalledTimes(2);
  });

  it('retries with the original root and clock, rejects a swapped bundle and keeps the first receipt after a staging failure', async () => {
    const pull = workflow({ sourceReview: retentionReview(baseline) });
    vi.mocked(fetchArchive).mockRejectedValueOnce(
      new Error('temporary download failure'),
    );
    await expect(pull.run()).rejects.toThrow('temporary download failure');
    const pinned = pull.outputs.get('manifest');
    advertise(successor);
    vi.stubEnv('MRTDOWN_DATA_URL', 'https://other.example.com');
    await expect(pull.run()).rejects.toThrow();
    expect(await rows()).toEqual([]);
    expect(truncateStagingTables).not.toHaveBeenCalled();
    advertise(baseline);
    vi.mocked(truncateStagingTables).mockRejectedValueOnce(
      new Error('temporary staging failure'),
    );
    await expect(pull.run()).rejects.toThrow('temporary staging failure');
    const first = await rows();
    expect(first).toHaveLength(1);
    expect(state.fingerprint).toBeUndefined();
    await pull.run();
    expect(await rows()).toEqual(first);
    expect(pull.outputs.get('manifest')).toEqual(pinned);
    expect(fetchManifest).toHaveBeenCalledOnce();
    expect(fetchArchive).toHaveBeenLastCalledWith('https://data.example.com');
    expect(recordCanonicalManifestFingerprint).toHaveBeenCalledOnce();
  });
});
