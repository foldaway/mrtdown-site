import { sql } from 'drizzle-orm';
import type { AppDb } from '~/db';
import {
  type lineOperatorsTable,
  type linesTable,
  metadataTable,
  type operatorsTable,
  publicHolidaysTable,
} from '~/db/schema';
import type { IncludedEntities, Line } from '~/types';
import { timeServerSpan } from '~/util/serverTiming';
import type {
  BaseIncludedEntities,
  IssueWithOperationalEffects,
} from './types';

const D1_SELECT_IN_BATCH = 90;
const CROWD_REPORT_DUPLICATE_LOCK_METADATA_PREFIX =
  'crowd_report_duplicate_lock:';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function readStringField(value: unknown, field: string) {
  if (!isRecord(value)) {
    return null;
  }

  const fieldValue = value[field];
  return typeof fieldValue === 'string' ? fieldValue : null;
}

export function isMissingTableError(error: unknown) {
  let current: unknown = error;
  const seen = new Set<unknown>();

  for (let depth = 0; current != null && depth < 6; depth++) {
    if (seen.has(current)) {
      break;
    }
    seen.add(current);

    const code = readStringField(current, 'code');
    if (code === '42P01') {
      return true;
    }

    const message =
      current instanceof Error
        ? current.message
        : readStringField(current, 'message');
    if (
      message != null &&
      /\bno such table\b/i.test(message) &&
      (message.includes('D1_ERROR') ||
        message.includes('SQLITE_ERROR') ||
        code === 'SQLITE_ERROR')
    ) {
      return true;
    }

    current = isRecord(current) ? current.cause : null;
  }

  return false;
}

export function chunk<T>(items: readonly T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export async function selectByIdChunks<T>(
  ids: readonly string[],
  selectBatch: (ids: string[]) => Promise<T[]>,
) {
  const rows: T[] = [];
  for (const batch of chunk(ids, D1_SELECT_IN_BATCH)) {
    rows.push(...(await selectBatch(batch)));
  }
  return rows;
}

export async function getDefaultDb() {
  const { getDb } = await import('~/db');
  return getDb();
}

export async function timeDbQuery<T>(name: string, query: () => Promise<T>) {
  return timeServerSpan(name, query);
}

export function publicMetadataKeySql() {
  return sql`${metadataTable.key} not like ${`${CROWD_REPORT_DUPLICATE_LOCK_METADATA_PREFIX}%`}`;
}

/**
 * Converts canonical multilingual name JSON into the app's fixed translation
 * shape, using any non-empty translation as the English fallback.
 */
export function parseTranslations(value: unknown): Line['name'] {
  const isNonEmptyTranslation = (
    translation: string | null | undefined,
  ): translation is string =>
    typeof translation === 'string' && translation.trim().length > 0;
  const rawTranslations =
    value != null && typeof value === 'object'
      ? (value as Record<string, string | null | undefined>)
      : {};
  const fallback =
    [rawTranslations['en-SG'], rawTranslations.en].find(
      isNonEmptyTranslation,
    ) ??
    Object.values(rawTranslations).find(isNonEmptyTranslation) ??
    '';
  return {
    'en-SG': fallback,
    'zh-Hans': rawTranslations['zh-Hans'] ?? null,
    ms: rawTranslations.ms ?? null,
    ta: rawTranslations.ta ?? null,
  };
}

export type LineRowForIncluded = Pick<
  typeof linesTable.$inferSelect,
  'id' | 'name' | 'type' | 'color' | 'started_at' | 'operating_hours'
>;

export type LineOperatorRowForIncluded = Pick<
  typeof lineOperatorsTable.$inferSelect,
  'line_id' | 'operator_id' | 'started_at' | 'ended_at'
>;

/**
 * Builds included line entities from compact line and line-operator rows.
 * Query modules should prefer this over reassembling operator memberships.
 */
export function buildLines(
  lineRows: LineRowForIncluded[],
  lineOperatorRows: LineOperatorRowForIncluded[],
) {
  const operatorsByLineId = lineOperatorRows.reduce<
    Record<string, Line['operators']>
  >((acc, row) => {
    acc[row.line_id] ??= [];
    acc[row.line_id].push({
      operatorId: row.operator_id,
      startedAt: row.started_at,
      endedAt: row.ended_at,
    });
    return acc;
  }, {});

  return Object.fromEntries(
    lineRows.map((row) => [
      row.id,
      {
        id: row.id,
        name: parseTranslations(row.name),
        type: row.type,
        color: row.color,
        startedAt: row.started_at,
        operatingHours: row.operating_hours,
        operators: operatorsByLineId[row.id] ?? [],
      } satisfies Line,
    ]),
  );
}

export type OperatorRowForIncluded = Pick<
  typeof operatorsTable.$inferSelect,
  'id' | 'name' | 'founded_at' | 'url'
>;

/**
 * Builds included operator entities from compact operator rows.
 * Query modules should use this to keep canonical field naming consistent.
 */
export function buildOperators(operatorRows: OperatorRowForIncluded[]) {
  return Object.fromEntries(
    operatorRows.map((row) => [
      row.id,
      {
        id: row.id,
        name: parseTranslations(row.name),
        foundedAt: row.founded_at,
        url: row.url,
      } satisfies IncludedEntities['operators'][string],
    ]),
  );
}

export type NamedIncludedEntity = {
  id: string;
  name: Line['name'];
};

/**
 * Builds simple included entities that only need an id and localized name,
 * such as towns and landmarks.
 */
export function buildNamedEntities<T extends { id: string; name: unknown }>(
  rows: T[],
) {
  return Object.fromEntries(
    rows.map((row) => [
      row.id,
      {
        id: row.id,
        name: parseTranslations(row.name),
      } satisfies NamedIncludedEntity,
    ]),
  );
}

/**
 * Reads public holiday dates as a Set for service-window calculations.
 * The caller supplies the span name so route-specific timings stay distinct.
 */
export async function getPublicHolidaySetFromDb(db: AppDb, spanName: string) {
  const rows = await timeDbQuery(spanName, () =>
    db
      .select({
        date: publicHolidaysTable.date,
      })
      .from(publicHolidaysTable),
  );
  return new Set(rows.map((row) => row.date));
}

/**
 * Combines a route's base included entities with issue-hydration entities.
 * Primary entities win for stations/operators/towns/landmarks so route-scoped
 * detail reads can preserve richer fields over issue-hydration stubs.
 */
export function mergeBaseIncluded(
  primaryIncluded: BaseIncludedEntities,
  secondaryIncluded: BaseIncludedEntities,
) {
  return {
    lines: {
      ...primaryIncluded.lines,
      ...secondaryIncluded.lines,
    },
    stations: {
      ...secondaryIncluded.stations,
      ...primaryIncluded.stations,
    },
    operators: {
      ...secondaryIncluded.operators,
      ...primaryIncluded.operators,
    },
    towns: {
      ...secondaryIncluded.towns,
      ...primaryIncluded.towns,
    },
    landmarks: {
      ...secondaryIncluded.landmarks,
      ...primaryIncluded.landmarks,
    },
  } satisfies BaseIncludedEntities;
}

/**
 * Groups hydrated operational issues by every affected line id. Issues can
 * appear under multiple lines when their affected branches span the network.
 */
export function groupIssuesByLineId(
  issues: Iterable<IssueWithOperationalEffects>,
) {
  const grouped: Record<string, IssueWithOperationalEffects[]> = {};
  for (const issue of issues) {
    for (const lineId of issue.lineIds) {
      grouped[lineId] ??= [];
      grouped[lineId].push(issue);
    }
  }
  return grouped;
}
