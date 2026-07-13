import { DateTime } from 'luxon';

const SG_TIMEZONE = 'Asia/Singapore';

type StationMembershipLifecycle = {
  endedAt?: string | null;
  startedAt: string;
};

/**
 * Returns whether a station membership should be shown in a view representing
 * the supplied point in time. Start dates are inclusive and end dates are
 * exclusive, so historical and future views show only codes valid then.
 */
export function isStationMembershipVisibleAt(
  membership: StationMembershipLifecycle,
  referenceAt: string,
) {
  const referenceDate = DateTime.fromISO(referenceAt, {
    zone: SG_TIMEZONE,
  })
    .setZone(SG_TIMEZONE)
    .toISODate();
  if (referenceDate == null) {
    throw new RangeError(
      `Invalid station membership reference: ${referenceAt}`,
    );
  }

  return (
    membership.startedAt <= referenceDate &&
    (membership.endedAt == null || membership.endedAt > referenceDate)
  );
}
