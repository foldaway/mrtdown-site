import { inArray } from 'drizzle-orm';
import { serviceRevisionPathStationEntriesTable as paths } from '~/db/schema';
import type { AppDbReader } from './database';

const columns = {
  service_revision_id: paths.service_revision_id,
  service_id: paths.service_id,
  station_id: paths.station_id,
  display_code: paths.display_code,
  path_index: paths.path_index,
};

export type ServicePathRow = Pick<
  typeof paths.$inferSelect,
  keyof typeof columns
>;

export function readServicePathRows(
  db: AppDbReader,
  revisionIds?: readonly string[],
): Promise<ServicePathRow[]> {
  if (revisionIds?.length === 0) return Promise.resolve([]);
  return db
    .select(columns)
    .from(paths)
    .where(
      revisionIds === undefined
        ? undefined
        : inArray(paths.service_revision_id, [...revisionIds]),
    );
}
