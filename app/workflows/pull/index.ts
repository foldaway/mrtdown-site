import { MRTDownRepository } from '@mrtdown/fs';
import {
  type WorkflowContext,
  WorkflowNonRetryableError,
} from '@upstash/workflow';
import { createWorkflow } from '@upstash/workflow/tanstack';
import { ZipStore } from '~/helpers/ZipStore.js';
import { purgePublicDataCache } from '~/util/cloudflareCache.js';
import { rebuildOperationalFactsRange } from '~/util/dbQueries/operationalFacts.js';
import { rebuildSitemapSnapshot } from '~/util/dbQueries/sitemap.js';
import { rebuildStatisticsSnapshot } from '~/util/dbQueries/statistics.js';
import { getDb } from '../../db/index.js';
import { fetchArchive } from './helpers/fetchArchive.js';
import { fetchManifest } from './helpers/fetchManifest.js';
import {
  acquireOrRenewPullWorkflowLease,
  releasePullWorkflowLease,
} from './helpers/workflowLease.js';
import {
  deleteLineOrphans,
  deleteOperatorsTownsLandmarksOrphans,
  deleteOrphanIssuesBatch,
  deleteServiceOrphans,
  deleteStationOrphans,
  finalizePull,
  insertIssuesStaging,
  insertLandmarksStaging,
  insertLinesStaging,
  insertOperatorsStaging,
  insertServicesStaging,
  insertStationsStaging,
  insertTownsStaging,
  syncChangedIssuesBatch,
  syncLines,
  syncOperatorsTownsLandmarksUpserts,
  syncServices,
  syncStationPlatformServices,
  syncStations,
  truncateStagingTables,
} from './helpers/stagingSync.js';

type Params = Record<string, never>;

const ISSUE_SYNC_BATCH_SIZE = 500;
const OPERATIONAL_FACTS_REBUILD_DAYS = 400;

async function runPullStep<T>(
  context: WorkflowContext<Params>,
  name: string,
  callback: () => Promise<T>,
) {
  return context.run(name, async () => {
    const acquired = await acquireOrRenewPullWorkflowLease(
      getDb(),
      context.workflowRunId,
    );
    if (!acquired) {
      throw new WorkflowNonRetryableError(
        'Another canonical data pull holds the workflow lease',
      );
    }
    return callback();
  });
}

/**
 * Durable pull pipeline: manifest → parse into staging → promote by domain →
 * truncate staging + metadata. Staging is the handoff between steps (no large step returns).
 */
async function executePull(context: WorkflowContext<Params>) {
  const dataUrl = process.env.MRTDOWN_DATA_URL;
  if (dataUrl == null) {
    throw new WorkflowNonRetryableError('MRTDOWN_DATA_URL not set');
  }

  const manifest = await runPullStep(context, 'manifest', async () =>
    fetchManifest(dataUrl),
  );

  const counts = await runPullStep(context, 'parse', async () => {
    const archiveBuffer = await fetchArchive(dataUrl);
    console.log('[PULL] Fetched archive', archiveBuffer.length);
    const store = new ZipStore(archiveBuffer);
    console.log('[PULL] Created zip store');

    const repo = new MRTDownRepository({ store });
    const db = getDb();
    await truncateStagingTables(db);

    // Stage one repository domain at a time so the workflow does not retain
    // the full parsed dataset in memory between inserts.
    let operatorsCount = 0;
    {
      const operators = repo.operators.list().map((operator) => ({
        ...operator,
        hash: manifest.operators[operator.id] ?? '',
      }));
      await insertOperatorsStaging(db, operators);
      operatorsCount = operators.length;
    }
    // The repository caches parsed entities; this drops only inflated ZIP bytes.
    store.clearCache();

    let townsCount = 0;
    {
      const towns = repo.towns.list().map((town) => ({
        ...town,
        hash: manifest.towns[town.id] ?? '',
      }));
      await insertTownsStaging(db, towns);
      townsCount = towns.length;
    }
    store.clearCache();

    let landmarksCount = 0;
    {
      const landmarks = repo.landmarks.list().map((landmark) => ({
        ...landmark,
        hash: manifest.landmarks[landmark.id] ?? '',
      }));
      await insertLandmarksStaging(db, landmarks);
      landmarksCount = landmarks.length;
    }
    store.clearCache();

    let linesCount = 0;
    {
      const lines = repo.lines.list().map((line) => ({
        ...line,
        hash: manifest.lines[line.id] ?? '',
      }));
      await insertLinesStaging(db, lines);
      linesCount = lines.length;
    }
    store.clearCache();

    let issuesCount = 0;
    {
      const issues = repo.issues.list().map((issue) => ({
        issue: {
          ...issue.issue,
          hash: manifest.issues[issue.issue.id] ?? '',
        },
        evidence: issue.evidence,
        impactEvents: issue.impactEvents,
      }));
      await insertIssuesStaging(db, issues);
      issuesCount = issues.length;
    }
    store.clearCache();

    let stationsCount = 0;
    {
      const stations = repo.stations.list().map((station) => ({
        ...station,
        hash: manifest.stations[station.id] ?? '',
      }));
      await insertStationsStaging(db, stations);
      stationsCount = stations.length;
    }
    store.clearCache();

    let servicesCount = 0;
    {
      const services = repo.services.list().map((service) => ({
        ...service,
        hash: manifest.services[service.id] ?? '',
      }));
      await insertServicesStaging(db, services);
      servicesCount = services.length;
    }
    store.clearCache();

    console.log(
      `[PULL] Parsed ${operatorsCount} operators, ${townsCount} towns, ${landmarksCount} landmarks, ${linesCount} lines, ${stationsCount} stations, ${servicesCount} services, ${issuesCount} issues`,
    );

    return {
      operators: operatorsCount,
      towns: townsCount,
      landmarks: landmarksCount,
      lines: linesCount,
      stations: stationsCount,
      services: servicesCount,
      issues: issuesCount,
    };
  });

  await runPullStep(
    context,
    'sync-operators-towns-landmarks-upserts',
    async () => {
      const db = getDb();
      await syncOperatorsTownsLandmarksUpserts(db);
    },
  );

  await runPullStep(context, 'sync-lines', async () => {
    const db = getDb();
    console.log('Syncing lines...');
    await syncLines(db);
  });

  await runPullStep(context, 'sync-stations', async () => {
    const db = getDb();
    console.log('Syncing stations...');
    await syncStations(db);
  });

  await runPullStep(context, 'sync-services', async () => {
    const db = getDb();
    console.log('Syncing services...');
    await syncServices(db);
  });

  await runPullStep(context, 'sync-station-platform-services', async () => {
    const db = getDb();
    console.log('Syncing station platform services...');
    await syncStationPlatformServices(db);
  });

  for (let batch = 1; ; batch++) {
    const processed = await runPullStep(
      context,
      `sync-issues-changed-${batch}`,
      async () => {
        const db = getDb();
        console.log(`Syncing changed issues batch ${batch}...`);
        try {
          return await syncChangedIssuesBatch(db, ISSUE_SYNC_BATCH_SIZE);
        } catch (error) {
          console.error(`Error syncing changed issues batch ${batch}`, error);
          throw error;
        }
      },
    );
    if (processed === 0) break;
  }

  for (let batch = 1; ; batch++) {
    const processed = await runPullStep(
      context,
      `sync-issues-orphans-${batch}`,
      async () => {
        const db = getDb();
        console.log(`Deleting orphan issues batch ${batch}...`);
        try {
          return await deleteOrphanIssuesBatch(db, ISSUE_SYNC_BATCH_SIZE);
        } catch (error) {
          console.error(`Error deleting orphan issues batch ${batch}`, error);
          throw error;
        }
      },
    );
    if (processed === 0) break;
  }

  await runPullStep(context, 'delete-service-orphans', async () => {
    const db = getDb();
    console.log('Deleting service orphans...');
    await deleteServiceOrphans(db);
  });

  await runPullStep(context, 'delete-station-orphans', async () => {
    const db = getDb();
    console.log('Deleting station orphans...');
    await deleteStationOrphans(db);
  });

  await runPullStep(context, 'delete-line-orphans', async () => {
    const db = getDb();
    console.log('Deleting line orphans...');
    await deleteLineOrphans(db);
  });

  await runPullStep(
    context,
    'delete-operators-towns-landmarks-orphans',
    async () => {
      const db = getDb();
      console.log('Deleting operators, towns and landmarks orphans...');
      await deleteOperatorsTownsLandmarksOrphans(db);
    },
  );

  await runPullStep(context, 'finalize', async () => {
    const db = getDb();
    console.log('Finalizing pull...');
    await finalizePull(db);
  });

  const facts = await runPullStep(
    context,
    'rebuild-operational-facts',
    async () => {
      console.log(
        `Rebuilding operational facts for ${OPERATIONAL_FACTS_REBUILD_DAYS} days...`,
      );
      return rebuildOperationalFactsRange(OPERATIONAL_FACTS_REBUILD_DAYS);
    },
  );

  console.log(`[PULL] Rebuilt operational facts for ${facts.length} days`);

  const statistics = await runPullStep(
    context,
    'rebuild-statistics-snapshot',
    async () => {
      console.log('[PULL] Rebuilding statistics snapshot...');
      return rebuildStatisticsSnapshot();
    },
  );

  console.log(
    `[PULL] Rebuilt statistics snapshot ${statistics.asOf} with ${statistics.issueIdsDisruptionLongest.length} longest disruptions`,
  );

  const sitemap = await runPullStep(
    context,
    'rebuild-sitemap-snapshot',
    async () => {
      console.log('[PULL] Rebuilding sitemap snapshot...');
      return rebuildSitemapSnapshot();
    },
  );

  console.log(
    `[PULL] Rebuilt sitemap snapshot ${sitemap.asOf} with ${sitemap.pathEntityCount} entity paths`,
  );

  await runPullStep(context, 'publish-public-data-cache', () =>
    purgePublicDataCache(),
  );

  console.log('[PULL] Pull complete', counts);
}

export const pullWorkflow = createWorkflow<Params, void>(
  async (context) => {
    const acquired = await context.run('acquire-pull-lease', async () =>
      acquireOrRenewPullWorkflowLease(getDb(), context.workflowRunId),
    );
    if (!acquired) {
      throw new WorkflowNonRetryableError(
        'Another canonical data pull is already running',
      );
    }

    await executePull(context);
    await context.run('release-pull-lease', async () =>
      releasePullWorkflowLease(getDb(), context.workflowRunId),
    );
  },
  {
    failureFunction: async ({ context }) => {
      await releasePullWorkflowLease(getDb(), context.workflowRunId);
    },
  },
);
