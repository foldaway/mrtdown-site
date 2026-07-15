import { DateTime } from 'luxon';

const SG_TIMEZONE = 'Asia/Singapore';

type StationMembershipLifecycle = {
  endedAt?: string | null;
  startedAt: string;
};

type StationMembershipCodeLifecycle = StationMembershipLifecycle & {
  code: string;
  lineId: string;
};

function getReferenceDate(referenceAt: string) {
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

  return referenceDate;
}

/**
 * Returns whether a station membership should be shown in a view representing
 * the supplied point in time. Start dates are inclusive and end dates are
 * exclusive, so historical and future views show only codes valid then.
 */
export function isStationMembershipVisibleAt(
  membership: StationMembershipLifecycle,
  referenceAt: string,
) {
  const referenceDate = getReferenceDate(referenceAt);

  return (
    membership.startedAt <= referenceDate &&
    (membership.endedAt == null || membership.endedAt > referenceDate)
  );
}

/**
 * Selects the station codes that are useful in a current or planned display.
 * Future codes are always retained. A closed code is retained unless another
 * active code on the same line supersedes it at this station.
 */
export function getVisibleStationMembershipsAt<
  T extends StationMembershipCodeLifecycle,
>(memberships: readonly T[], referenceAt: string): T[] {
  const referenceDate = getReferenceDate(referenceAt);
  const activeCodesByLineId = new Map<string, Set<string>>();

  for (const membership of memberships) {
    const isActive =
      membership.startedAt <= referenceDate &&
      (membership.endedAt == null || membership.endedAt > referenceDate);
    if (!isActive) {
      continue;
    }

    const codes = activeCodesByLineId.get(membership.lineId) ?? new Set();
    codes.add(membership.code);
    activeCodesByLineId.set(membership.lineId, codes);
  }

  return memberships.filter((membership) => {
    if (
      membership.startedAt > referenceDate ||
      membership.endedAt == null ||
      membership.endedAt > referenceDate
    ) {
      return true;
    }

    const activeCodes = activeCodesByLineId.get(membership.lineId);
    return (
      activeCodes == null ||
      (activeCodes.size === 1 && activeCodes.has(membership.code))
    );
  });
}
