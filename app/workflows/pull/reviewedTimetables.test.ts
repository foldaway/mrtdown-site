import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { Manifest } from '@mrtdown/core';
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
import { retainScheduledTimetable } from '~/util/dbQueries/retainScheduledTimetable';
import { retentionReview } from '~/util/dbQueries/scheduledTimetableRetention.fixture';
import { fetchArchive } from './helpers/fetchArchive';
import { fetchManifest } from './helpers/fetchManifest';
import { recordCanonicalManifestFingerprint } from './helpers/manifestFingerprint';
import type { PullParams } from './helpers/pullParams';
import { scheduledTimetableArchiveFixture } from './helpers/scheduledTimetableArchive.fixture';
import { truncateStagingTables } from './helpers/stagingSync';
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

const baseline = scheduledTimetableArchiveFixture();
const successor = scheduledTimetableArchiveFixture('b');
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
function advertise(bundle = baseline) {
  vi.mocked(fetchManifest).mockResolvedValue({
    ...manifest,
    scheduledTimetable: bundle.entry,
  });
  vi.mocked(fetchArchive).mockResolvedValue(
    Buffer.from(
      zipSync(
        Object.fromEntries(
          Object.entries(bundle.files).map(([name, bytes]) => [
            `data/scheduled-timetable/${name}`,
            bytes,
          ]),
        ),
      ),
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
  state.fingerprint = undefined;
  vi.mocked(getDb).mockReturnValue({} as ReturnType<typeof getDb>);
  vi.mocked(fetchManifest).mockResolvedValue(manifest);
  vi.mocked(fetchArchive).mockResolvedValue(Buffer.from(zipSync({})));
});
afterEach(() => vi.unstubAllEnvs());

describe('pull timetable admission', () => {
  it.each([undefined, '', {}])(
    'keeps empty GTFS-free pulls working: %s',
    async (payload) => {
      const pull = workflow(payload);
      await pull.run();
      expect(truncateStagingTables).toHaveBeenCalledOnce();
      expect(retainScheduledTimetable).not.toHaveBeenCalled();
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
    await state.failure?.({ context: pull.context });
    expect(releasePullWorkflowLease).toHaveBeenCalledWith(
      expect.anything(),
      pull.context.workflowRunId,
    );
  });
});

const url = process.env.TEST_TIMETABLE_DATABASE_URL;
const schema = `gtfs_pull_test_${randomUUID().replaceAll('-', '')}`;
describe.skipIf(!url)('pull with PostgreSQL timetable retention', () => {
  let admin: Pool;
  let pool: Pool;
  beforeAll(async () => {
    admin = new Pool({ connectionString: url });
    await admin.query(`CREATE SCHEMA ${schema}`);
    pool = new Pool({
      connectionString: url,
      options: `-c search_path=${schema}`,
    });
    await pool.query(
      await readFile(
        new URL(
          '../../../drizzle/20261024214325_superb_violations/migration.sql',
          import.meta.url,
        ),
        'utf8',
      ),
    );
  });
  beforeEach(async () => {
    await pool.query('TRUNCATE scheduled_timetables');
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

  it('retains reviewed bytes, replays without approval and detects a timetable-only successor', async () => {
    const pull = workflow({ sourceReview: retentionReview(baseline) });
    await pull.run();
    const first = await rows();
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
    // Force another parse (e.g. a pipeline rebuild) without a fresh review.
    state.fingerprint = undefined;
    await workflow().run();
    expect(await rows()).toEqual(first);
    expect(retainScheduledTimetable).toHaveBeenCalledTimes(2);
    advertise(successor);
    await workflow({
      sourceReview: retentionReview(successor, baseline),
    }).run();
    expect(await rows()).toHaveLength(2);
    expect(truncateStagingTables).toHaveBeenCalledTimes(3);
  });

  it('blocks missing or wrong source review while preserving retained data and the successful fingerprint', async () => {
    await workflow({ sourceReview: retentionReview(baseline) }).run();
    const first = await rows();
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
    expect(state.fingerprint).toBe(fingerprint);
    expect(truncateStagingTables).not.toHaveBeenCalled();
    expect(recordCanonicalManifestFingerprint).not.toHaveBeenCalled();
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
