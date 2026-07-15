type LineMembership = {
  lineId: string;
};

export function orderStationMemberships<T extends LineMembership>(
  memberships: readonly T[],
  currentLineId: string,
  side: 'left' | 'right',
) {
  const ordered = [...memberships].sort((first, second) => {
    if (first.lineId === currentLineId) {
      return -1;
    }
    if (second.lineId === currentLineId) {
      return 1;
    }
    return 0;
  });

  return side === 'left' ? ordered.reverse() : ordered;
}
