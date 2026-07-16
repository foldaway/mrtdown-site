import { DateTime } from 'luxon';
import { selectServiceRevisionForReferenceDate } from '~/util/serviceRevisions';

const SG_TIMEZONE = 'Asia/Singapore';

export type AffectedServiceRevision = {
  id: string;
  startAt: string | null;
  endAt: string | null;
  updatedAt: string;
  stationIds: string[];
};

export function selectAffectedServiceRevisionForReferenceAt(
  revisions: readonly AffectedServiceRevision[],
  referenceAt: string,
) {
  const referenceDate = DateTime.fromISO(referenceAt, {
    setZone: true,
  })
    .setZone(SG_TIMEZONE)
    .toISODate();
  if (referenceDate == null) {
    return undefined;
  }

  return selectServiceRevisionForReferenceDate(
    revisions.map((revision) => ({
      revision,
      id: revision.id,
      start_at: revision.startAt,
      end_at: revision.endAt,
      updated_at: revision.updatedAt,
    })),
    referenceDate,
  )?.revision;
}
