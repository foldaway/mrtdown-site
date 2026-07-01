import { asc, eq } from 'drizzle-orm';
import type { AppDb } from '~/db';
import { linesTable, metadataTable, operatorsTable } from '~/db/schema';
import { timeServerSpan } from '~/util/serverTiming';

export const ROOT_LAST_UPDATED_METADATA_KEY = 'manifest_last_pulled_at';

export type RootDataDb = Pick<AppDb, 'select'>;

async function getDefaultDb() {
  const { getDb } = await import('~/db');
  return getDb();
}

export async function getRootData() {
  return timeServerSpan('root_data', async () => {
    const db = await getDefaultDb();
    return getRootDataFromDb(db);
  });
}

export async function getRootDataFromDb(db: RootDataDb) {
  const [lineRows, metadataRows, operatorRows] = await timeServerSpan(
    'root_nav_queries',
    () =>
      Promise.all([
        timeServerSpan('root_q_lines', () =>
          db
            .select({
              id: linesTable.id,
              name: linesTable.name,
              color: linesTable.color,
            })
            .from(linesTable)
            .orderBy(asc(linesTable.id)),
        ),
        timeServerSpan('root_q_metadata', () =>
          db
            .select({
              key: metadataTable.key,
              value: metadataTable.value,
            })
            .from(metadataTable)
            .where(eq(metadataTable.key, ROOT_LAST_UPDATED_METADATA_KEY))
            .orderBy(asc(metadataTable.key)),
        ),
        timeServerSpan('root_q_operators', () =>
          db
            .select({
              id: operatorsTable.id,
              name: operatorsTable.name,
            })
            .from(operatorsTable)
            .orderBy(asc(operatorsTable.id)),
        ),
      ]),
  );

  return {
    lineNavItems: lineRows,
    metadata: metadataRows,
    operatorNavItems: operatorRows,
  };
}
