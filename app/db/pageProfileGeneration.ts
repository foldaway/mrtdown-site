import { eq } from 'drizzle-orm';
import type { getDb } from './index';
import { metadataTable } from './schema';

type Db = ReturnType<typeof getDb>;

const GENERATION_KEY = 'public_page_profile_generation';
const COMPLETE_PREFIX = 'complete:';

async function writeGeneration(db: Pick<Db, 'insert'>, value: string) {
  await db
    .insert(metadataTable)
    .values({ key: GENERATION_KEY, value })
    .onConflictDoUpdate({ target: metadataTable.key, set: { value } });
}

export function markPageProfilesUpdating(db: Pick<Db, 'insert'>) {
  return writeGeneration(db, 'updating');
}

export function completePageProfileGeneration(
  db: Pick<Db, 'insert'>,
  generation: string,
) {
  return writeGeneration(db, `${COMPLETE_PREFIX}${generation}`);
}

export async function readCompletedPageProfileGeneration(
  db: Pick<Db, 'select'>,
) {
  const [row] = await db
    .select({ value: metadataTable.value })
    .from(metadataTable)
    .where(eq(metadataTable.key, GENERATION_KEY));
  if (row?.value.startsWith(COMPLETE_PREFIX)) {
    return row.value.slice(COMPLETE_PREFIX.length);
  }
}
