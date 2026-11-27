import type { getDb } from '~/db';
import { scheduledTimetablesTable } from '~/db/scheduledTimetables.schema';
import {
  scheduledTimetableHistoryColumns,
  validateScheduledTimetableHistory,
} from '~/util/dbQueries/scheduledTimetableHistory';

/** The latest admitted receipt is the trust root for an empty replay. */
export async function retainedCombinedReleaseIndex(
  db: ReturnType<typeof getDb>,
) {
  const history = validateScheduledTimetableHistory(
    await db
      .select(scheduledTimetableHistoryColumns)
      .from(scheduledTimetablesTable),
  );
  return history.at(-1)?.combinedReleaseIndex;
}
