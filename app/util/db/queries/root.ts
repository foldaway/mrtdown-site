import { asc, eq } from 'drizzle-orm';
import type { AppDb } from '~/db';
import { linesTable, metadataTable, operatorsTable } from '~/db/schema';
import { timeServerSpan } from '~/util/serverTiming';

export const ROOT_LAST_UPDATED_METADATA_KEY = 'manifest_last_pulled_at';

export type RootDataDb = Pick<AppDb, 'batch' | 'select'>;

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

/**
 * Fetches the small root layout/navigation payload in one D1 batch so every
 * request still reads current DB state without paying three separate round trips.
 */
export async function getRootDataFromDb(db: RootDataDb) {
  const lineQuery = db
    .select({
      id: linesTable.id,
      name: linesTable.name,
      color: linesTable.color,
    })
    .from(linesTable)
    .orderBy(asc(linesTable.id));
  const metadataQuery = db
    .select({
      key: metadataTable.key,
      value: metadataTable.value,
    })
    .from(metadataTable)
    .where(eq(metadataTable.key, ROOT_LAST_UPDATED_METADATA_KEY))
    .limit(1);
  const operatorQuery = db
    .select({
      id: operatorsTable.id,
      name: operatorsTable.name,
    })
    .from(operatorsTable)
    .orderBy(asc(operatorsTable.id));

  const [lineRows, metadataRows, operatorRows] = await timeServerSpan(
    'root_nav_batch',
    () => db.batch([lineQuery, metadataQuery, operatorQuery]),
  );

  return {
    lineNavItems: lineRows,
    metadata: metadataRows,
    operatorNavItems: operatorRows,
  };
}
