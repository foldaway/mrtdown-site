import type {
  ScheduledTimetableRollbackAssessment,
  ScheduledTimetableRollbackOptions,
} from '@mrtdown/fs';
import type { ScheduledTimetableSelection } from './withSelectedScheduledTimetable';

type Version = NonNullable<ScheduledTimetableSelection['selected']>['version'];

// fs alpha.44 keeps its metadata assessment internal. Mirror those decisions
// without hydrating historical bodies; parity is checked against its public selector.
export function assessIndexedTimetableRollback(
  rollback: ScheduledTimetableRollbackOptions,
  selection: ScheduledTimetableSelection,
  history: readonly Version[],
): ScheduledTimetableRollbackAssessment {
  const { review, selectionInstant } = rollback;
  const { scope, serviceDate, selected } = selection;
  if (
    serviceDate < review.dateRange.startDate ||
    serviceDate > review.dateRange.endDate ||
    scope.stationId !== review.scope.stationId ||
    scope.lineId !== review.scope.lineId ||
    scope.serviceId !== review.scope.serviceId ||
    scope.destinationStationId !== review.scope.destinationStationId ||
    scope.platformId !== review.scope.platformId
  ) {
    return { status: 'not-applicable', review, selectionInstant, blockers: [] };
  }
  const blockers: string[] = [];
  const fromIndex = history.findIndex(
    (version) => version.manifestSha256 === review.from.manifestSha256,
  );
  const toIndex = history.findIndex(
    (version) => version.manifestSha256 === review.to.manifestSha256,
  );
  const from = history[fromIndex];
  const to = history[toIndex];
  if (selected?.version.manifestSha256 !== review.from.manifestSha256) {
    blockers.push('rollback-from-is-not-current-selection');
  }
  if (!to) {
    blockers.push('rollback-target-is-not-retained');
  } else if (toIndex >= fromIndex) {
    blockers.push('rollback-target-is-not-older');
  }
  if (
    from?.manifest.capture.sha256 !== review.from.snapshotSha256 ||
    to?.manifest.capture.sha256 !== review.to.snapshotSha256
  ) {
    blockers.push('rollback-source-identities-do-not-match');
  }
  if (
    from &&
    Date.parse(review.reviewedAt) < Date.parse(from.record.importInstant)
  ) {
    blockers.push('rollback-review-precedes-current-import');
  }
  if (Date.parse(review.reviewedAt) > Date.parse(selectionInstant)) {
    blockers.push('rollback-review-is-in-the-future');
  }
  return {
    status: blockers.length > 0 ? 'rejected' : 'applied',
    review,
    selectionInstant,
    blockers,
  };
}
