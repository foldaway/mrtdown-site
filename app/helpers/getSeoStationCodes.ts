import { getVisibleStationMembershipsAt } from './isStationMembershipVisibleAt';

export function getSeoStationCodes(
  memberships: ReadonlyArray<{
    code: string;
    endedAt?: string;
    lineId: string;
    startedAt: string;
  }>,
  referenceAt: string,
) {
  return [
    ...new Set(
      getVisibleStationMembershipsAt(memberships, referenceAt).map(
        (membership) => membership.code,
      ),
    ),
  ];
}
