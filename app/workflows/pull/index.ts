import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from 'cloudflare:workers';
import { MRTDownRepository } from '@mrtdown/fs';
import { ZipStore } from '~/helpers/ZipStore.js';
import { getDb } from '../../db/index.js';
import { fetchArchive } from './helpers/fetchArchive.js';
import { fetchManifest } from './helpers/fetchManifest.js';
import {
  finalizePull,
  insertIssuesStaging,
  insertLandmarksStaging,
  insertLinesStaging,
  insertOperatorsStaging,
  insertServicesStaging,
  insertStationsStaging,
  insertTownsStaging,
  syncIssues,
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

/**
 * Durable pull pipeline: manifest → parse into staging → promote by domain →
 * truncate staging + metadata. Staging is the handoff between steps (no large step returns).
 */
export class PullWorkflow extends WorkflowEntrypoint<Env, Params> {
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
      const operators = repo.operators.list().map((operator) => ({
        ...operator,
        hash: manifest.operators[operator.id] ?? '',
      }));
      await insertOperatorsStaging(db, operators);
      // The repository caches parsed entities; this drops only inflated ZIP bytes.
      store.clearCache();

      const towns = repo.towns.list().map((town) => ({
        ...town,
        hash: manifest.towns[town.id] ?? '',
      }));
      await insertTownsStaging(db, towns);
      store.clearCache();

      const landmarks = repo.landmarks.list().map((landmark) => ({
        ...landmark,
        hash: manifest.landmarks[landmark.id] ?? '',
      }));
      await insertLandmarksStaging(db, landmarks);
      store.clearCache();

      const lines = repo.lines.list().map((line) => ({
        ...line,
        hash: manifest.lines[line.id] ?? '',
      }));
      await insertLinesStaging(db, lines);
      store.clearCache();

      const issues = repo.issues.list().map((issue) => ({
        issue: {
          ...issue.issue,
          hash: manifest.issues[issue.issue.id] ?? '',
        },
        evidence: issue.evidence,
        impactEvents: issue.impactEvents,
      }));
      await insertIssuesStaging(db, issues);
      store.clearCache();

      const stations = repo.stations.list().map((station) => ({
        ...station,
        hash: manifest.stations[station.id] ?? '',
      }));
      await insertStationsStaging(db, stations);
      store.clearCache();

      const services = repo.services.list().map((service) => ({
        ...service,
        hash: manifest.services[service.id] ?? '',
      }));
      await insertServicesStaging(db, services);
      store.clearCache();

      console.log(
        `[PULL] Parsed ${operators.length} operators, ${towns.length} towns, ${landmarks.length} landmarks, ${lines.length} lines, ${stations.length} stations, ${services.length} services, ${issues.length} issues`,
      );

      return {
        operators: operators.length,
        towns: towns.length,
        landmarks: landmarks.length,
        lines: lines.length,
        stations: stations.length,
        services: services.length,
        issues: issues.length,
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

    await step.do('sync-issues', syncStepConfig, async () => {
      const db = getDb();
      console.log('Syncing issues...');
      try {
        await syncIssues(db);
      } catch (error) {
        console.error('Error syncing issues', error);
        throw error;
      }
    });

    await step.do('finalize', syncStepConfig, async () => {
      const db = getDb();
      console.log('Finalizing pull...');
      await finalizePull(db);
    });

    console.log('[PULL] Pull complete', counts);
  }
}
