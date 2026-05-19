import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from 'cloudflare:workers';
import { MRTDownRepository } from '@mrtdown/fs';
import * as Sentry from '@sentry/cloudflare';
import { ZipStore } from '~/helpers/ZipStore.js';
import { getDb } from '../../db/index.js';
import { fetchArchive } from './helpers/fetchArchive.js';
import { fetchManifest } from './helpers/fetchManifest.js';
import {
  deleteOrphanIssuesBatch,
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
  syncOperatorsTownsLandmarks,
  syncServices,
  syncStations,
  truncateStagingTables,
} from './helpers/stagingSync.js';

type Params = Record<string, never>;

/** CPU-heavy gzip/tar parse + batched writes to `*_next`; larger timeout for big archives. */
const parseStepConfig = {
  retries: {
    limit: 2,
    delay: '10 seconds' as const,
    backoff: 'linear' as const,
  },
  timeout: '5 minutes' as const,
};

/** DB promotion steps: retries for transient Hyperdrive / Postgres errors. */
const syncStepConfig = {
  retries: {
    limit: 3,
    delay: '5 seconds' as const,
    backoff: 'exponential' as const,
  },
};

const ISSUE_SYNC_BATCH_SIZE = 100;

/**
 * Durable pull pipeline: manifest → parse into staging → promote by domain →
 * truncate staging + metadata. Staging is the handoff between steps (no large step returns).
 */
class PullWorkflowBase extends WorkflowEntrypoint<Env, Params> {
  async run(_event: WorkflowEvent<Params>, step: WorkflowStep) {
    const dataUrl = this.env.MRTDOWN_DATA_URL;

    const manifest = await step.do('manifest', async () =>
      fetchManifest(dataUrl),
    );

    const counts = await step.do('parse', parseStepConfig, async () => {
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

    await step.do(
      'sync-operators-towns-landmarks',
      syncStepConfig,
      async () => {
        const db = getDb();
        await syncOperatorsTownsLandmarks(db);
      },
    );

    await step.do('sync-lines', syncStepConfig, async () => {
      const db = getDb();
      console.log('Syncing lines...');
      await syncLines(db);
    });

    await step.do('sync-stations', syncStepConfig, async () => {
      const db = getDb();
      console.log('Syncing stations...');
      await syncStations(db);
    });

    await step.do('sync-services', syncStepConfig, async () => {
      const db = getDb();
      console.log('Syncing services...');
      await syncServices(db);
    });

    for (let batch = 1; ; batch++) {
      const processed = await step.do(
        `sync-issues-changed-${batch}`,
        syncStepConfig,
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
      const processed = await step.do(
        `sync-issues-orphans-${batch}`,
        syncStepConfig,
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

    await step.do('finalize', syncStepConfig, async () => {
      const db = getDb();
      console.log('Finalizing pull...');
      await finalizePull(db);
    });

    console.log('[PULL] Pull complete', counts);
  }
}

export const PullWorkflow = Sentry.instrumentWorkflowWithSentry((env: Env) => {
  return {
    dsn: env.SENTRY_DSN ?? '',
    environment: env.TIER ?? 'development',
  };
}, PullWorkflowBase);
