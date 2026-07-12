export function getSeoStationCodes(
  memberships: ReadonlyArray<{ code: string; endedAt?: string }>,
) {
  return [
    ...new Set(
      memberships
        .filter((membership) => membership.endedAt == null)
        .map((membership) => membership.code),
    ),
  ];
}
