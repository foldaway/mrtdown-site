import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PULL_CRON = '0 0 * * *';
const PUBLIC_HOLIDAYS_CRON = '0 18 * * SUN';

export const DEPLOYMENT_TIERS = ['preview', 'staging', 'production'];

function assertNonEmpty(value, name) {
  if (value == null || value.trim() === '') {
    throw new Error(`${name} must be set`);
  }
  return value.trim();
}

export function parseDeploymentTier(value) {
  const tier = assertNonEmpty(value, 'TIER');
  if (!DEPLOYMENT_TIERS.includes(tier)) {
    throw new Error(
      `TIER must be one of: ${DEPLOYMENT_TIERS.join(', ')} (received ${tier})`,
    );
  }
  return tier;
}

function normalizeRootUrl(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('VITE_ROOT_URL must use http or https');
  }
  if (url.username !== '' || url.password !== '') {
    throw new Error('VITE_ROOT_URL must not contain credentials');
  }
  return url.origin;
}

export function buildManagedSchedules({ internalApiToken, rootUrl, tier }) {
  const prefix = `mrtdown-${tier}`;
  const origin = normalizeRootUrl(rootUrl);

  return [
    {
      scheduleId: `${prefix}-pull`,
      destination: new URL('/internal/api/workflows/pull', origin).toString(),
      cron: PULL_CRON,
      retries: 3,
      label: `${prefix}-pull`,
      flowControl: {
        key: `${prefix}-pull`,
        parallelism: 1,
      },
    },
    {
      scheduleId: `${prefix}-public-holidays`,
      destination: new URL(
        '/internal/api/workflows/publicHolidays',
        origin,
      ).toString(),
      cron: PUBLIC_HOLIDAYS_CRON,
      retries: 3,
      label: `${prefix}-public-holidays`,
      flowControl: {
        key: `${prefix}-public-holidays`,
        parallelism: 1,
      },
    },
    {
      scheduleId: `${prefix}-crowd-report-dispatch`,
      destination: new URL(
        '/internal/api/tasks/crowd-report-dispatch',
        origin,
      ).toString(),
      cron: PULL_CRON,
      retries: 3,
      label: `${prefix}-crowd-report-dispatch`,
      headers: {
        Authorization: `Bearer ${assertNonEmpty(
          internalApiToken,
          'INTERNAL_API_TOKEN',
        )}`,
      },
      redactHeaders: ['Authorization'],
    },
  ];
}

export function buildScheduleRequest(schedule, { qstashToken, qstashUrl }) {
  const headers = new Headers({
    Authorization: `Bearer ${assertNonEmpty(qstashToken, 'QSTASH_TOKEN')}`,
    'Content-Type': 'application/json',
    'Upstash-Cron': schedule.cron,
    'Upstash-Schedule-Id': schedule.scheduleId,
    'Upstash-Retries': String(schedule.retries),
    'Upstash-Label': schedule.label,
  });

  for (const [name, value] of Object.entries(schedule.headers ?? {})) {
    headers.set(`Upstash-Forward-${name}`, value);
  }
  if (schedule.flowControl != null) {
    headers.set('Upstash-Flow-Control-Key', schedule.flowControl.key);
    headers.set(
      'Upstash-Flow-Control-Value',
      `parallelism=${schedule.flowControl.parallelism}`,
    );
  }
  if (schedule.redactHeaders?.length > 0) {
    headers.set(
      'Upstash-Redact-Fields',
      schedule.redactHeaders.map((name) => `header[${name}]`).join(','),
    );
  }

  const baseUrl = assertNonEmpty(qstashUrl, 'QSTASH_URL').replace(/\/$/, '');
  return {
    url: `${baseUrl}/v2/schedules/${schedule.destination}`,
    init: {
      method: 'POST',
      headers,
    },
  };
}

export async function syncManagedSchedules(
  schedules,
  config,
  fetchImplementation = fetch,
) {
  const scheduleIds = [];
  for (const schedule of schedules) {
    const request = buildScheduleRequest(schedule, config);
    const response = await fetchImplementation(request.url, request.init);
    if (!response.ok) {
      throw new Error(
        `Failed to sync ${schedule.scheduleId}: ${response.status} ${await response.text()}`,
      );
    }
    const result = await response.json();
    scheduleIds.push(result.scheduleId);
  }
  return scheduleIds;
}

function redactScheduleForOutput(schedule) {
  return {
    ...schedule,
    headers:
      schedule.headers == null
        ? undefined
        : Object.fromEntries(
            Object.keys(schedule.headers).map((name) => [name, '<redacted>']),
          ),
  };
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const schedules = buildManagedSchedules({
    tier: parseDeploymentTier(process.env.TIER),
    rootUrl: assertNonEmpty(process.env.VITE_ROOT_URL, 'VITE_ROOT_URL'),
    internalApiToken: assertNonEmpty(
      process.env.INTERNAL_API_TOKEN,
      'INTERNAL_API_TOKEN',
    ),
  });

  if (dryRun) {
    console.log(
      JSON.stringify(schedules.map(redactScheduleForOutput), null, 2),
    );
    return;
  }

  const scheduleIds = await syncManagedSchedules(schedules, {
    qstashUrl: process.env.QSTASH_URL,
    qstashToken: process.env.QSTASH_TOKEN,
  });
  console.log(`Synced ${scheduleIds.length} QStash schedules:`);
  for (const scheduleId of scheduleIds) {
    console.log(`- ${scheduleId}`);
  }
}

const entryPath = process.argv[1] == null ? null : resolve(process.argv[1]);
if (entryPath === fileURLToPath(import.meta.url)) {
  await main();
}
