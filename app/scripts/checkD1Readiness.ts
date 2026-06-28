import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

type D1ReadinessCounts = {
  line_day_facts: number;
  lines: number;
  public_holidays: number;
  service_revisions: number;
  services: number;
  statistics_snapshots: number;
  stations: number;
};

type D1ExecuteResult = {
  results?: Record<string, unknown>[];
  success?: boolean;
  error?: string;
  meta?: Record<string, unknown>;
};

const COUNT_QUERY = `
select
  (select count(*) from lines) as lines,
  (select count(*) from stations) as stations,
  (select count(*) from services) as services,
  (select count(*) from service_revisions) as service_revisions,
  (select count(*) from public_holidays) as public_holidays,
  (select count(*) from line_day_facts) as line_day_facts,
  (select count(*) from statistics_snapshots) as statistics_snapshots;
`;

function getTargetEnv() {
  const targetEnv = process.argv[2] ?? process.env.CLOUDFLARE_ENV;
  if (targetEnv == null || targetEnv.length === 0) {
    throw new Error(
      'Pass a Cloudflare environment, or set CLOUDFLARE_ENV before checking D1 readiness.',
    );
  }
  return targetEnv;
}

function getMinimumCount(name: string) {
  const rawValue = process.env[name];
  if (rawValue == null || rawValue === '') {
    throw new Error(`${name} must be set to a realistic environment minimum.`);
  }

  const parsedValue = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsedValue) || parsedValue < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }
  return parsedValue;
}

function getMinimumCounts(): D1ReadinessCounts {
  return {
    lines: getMinimumCount('D1_MIN_LINES'),
    stations: getMinimumCount('D1_MIN_STATIONS'),
    services: getMinimumCount('D1_MIN_SERVICES'),
    service_revisions: getMinimumCount('D1_MIN_SERVICE_REVISIONS'),
    public_holidays: getMinimumCount('D1_MIN_PUBLIC_HOLIDAYS'),
    line_day_facts: getMinimumCount('D1_MIN_LINE_DAY_FACTS'),
    statistics_snapshots: getMinimumCount('D1_MIN_STATISTICS_SNAPSHOTS'),
  };
}

export function extractJsonPayload(stdout: string) {
  const startIndex = stdout.search(/[[{]/);
  if (startIndex === -1) {
    throw new Error('Wrangler D1 output did not contain JSON.');
  }

  const stack: string[] = [];
  let inString = false;
  let escaped = false;

  for (let index = startIndex; index < stdout.length; index++) {
    const char = stdout[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = inString;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === '[' || char === '{') {
      stack.push(char === '[' ? ']' : '}');
      continue;
    }

    if (char === ']' || char === '}') {
      if (stack.at(-1) !== char) {
        throw new Error('Wrangler D1 output contained invalid JSON.');
      }

      stack.pop();
      if (stack.length === 0) {
        return stdout.slice(startIndex, index + 1);
      }
    }
  }

  throw new Error('Wrangler D1 output contained incomplete JSON.');
}

export function parseD1ExecuteResult(stdout: string): D1ExecuteResult {
  const parsed = JSON.parse(extractJsonPayload(stdout)) as unknown;
  const result = Array.isArray(parsed) ? parsed[0] : parsed;
  if (result == null || typeof result !== 'object') {
    throw new Error('Wrangler D1 JSON output did not contain a result object.');
  }
  return result as D1ExecuteResult;
}

function getCountValue(
  row: Record<string, unknown>,
  key: keyof D1ReadinessCounts,
) {
  const value = row[key];
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsedValue = Number.parseInt(value, 10);
    if (Number.isFinite(parsedValue)) {
      return parsedValue;
    }
  }
  throw new Error(`D1 readiness query returned an invalid ${key} count.`);
}

function extractCounts(result: D1ExecuteResult): D1ReadinessCounts {
  if (result.success === false) {
    throw new Error(result.error ?? 'Wrangler D1 readiness query failed.');
  }

  const row = result.results?.[0];
  if (row == null) {
    throw new Error('D1 readiness query returned no rows.');
  }

  return {
    lines: getCountValue(row, 'lines'),
    stations: getCountValue(row, 'stations'),
    services: getCountValue(row, 'services'),
    service_revisions: getCountValue(row, 'service_revisions'),
    public_holidays: getCountValue(row, 'public_holidays'),
    line_day_facts: getCountValue(row, 'line_day_facts'),
    statistics_snapshots: getCountValue(row, 'statistics_snapshots'),
  };
}

function getReadinessFailures(
  counts: D1ReadinessCounts,
  minimumCounts: D1ReadinessCounts,
) {
  return Object.entries(minimumCounts).flatMap(([tableName, minimum]) => {
    const count = counts[tableName as keyof D1ReadinessCounts];
    if (count >= minimum) {
      return [];
    }
    return [`${tableName} has ${count} rows; expected at least ${minimum}`];
  });
}

function main() {
  const targetEnv = getTargetEnv();
  const minimumCounts = getMinimumCounts();
  const result = spawnSync(
    'npx',
    [
      'wrangler',
      'd1',
      'execute',
      'DB',
      '--yes',
      '--remote',
      '--env',
      targetEnv,
      '--command',
      COUNT_QUERY,
      '--json',
    ],
    {
      encoding: 'utf8',
    },
  );

  if (result.error != null) {
    throw result.error;
  }

  if (result.status !== 0) {
    console.error(result.stdout);
    console.error(result.stderr);
    throw new Error(`Wrangler D1 readiness query exited ${result.status}`);
  }

  const queryResult = parseD1ExecuteResult(result.stdout);
  const counts = extractCounts(queryResult);
  console.table(
    Object.entries(counts).map(([tableName, count]) => ({
      table: tableName,
      rows: count,
      minimum: minimumCounts[tableName as keyof D1ReadinessCounts],
    })),
  );

  if (queryResult.meta != null) {
    console.log('D1 query metrics:', JSON.stringify(queryResult.meta));
  }

  const failures = getReadinessFailures(counts, minimumCounts);
  if (failures.length > 0) {
    console.error(
      [
        `D1 readiness check failed for ${targetEnv}:`,
        ...failures.map((failure) => `- ${failure}`),
      ].join('\n'),
    );
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
