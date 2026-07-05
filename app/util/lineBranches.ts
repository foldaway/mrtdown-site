type LineBranchLifecycleFields = {
  startedAt: string | null;
  endedAt: string | null;
};

type LineStationCountStation = {
  memberships: readonly {
    lineId: string;
    startedAt: string;
    endedAt?: string | null;
  }[];
};

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

export function lineBranchHasEnded(
  branch: LineBranchLifecycleFields,
  referenceDate = todayIsoDate(),
) {
  return branch.endedAt != null && branch.endedAt < referenceDate;
}

export function lineBranchHasStarted(
  branch: LineBranchLifecycleFields,
  referenceDate = todayIsoDate(),
) {
  return branch.startedAt != null && branch.startedAt <= referenceDate;
}

export function lineBranchIsActiveOn(
  branch: LineBranchLifecycleFields,
  referenceDate = todayIsoDate(),
) {
  return (
    lineBranchHasStarted(branch, referenceDate) &&
    !lineBranchHasEnded(branch, referenceDate)
  );
}

function branchLifecycleRank(
  branch: LineBranchLifecycleFields,
  referenceDate: string,
) {
  if (lineBranchIsActiveOn(branch, referenceDate)) {
    return 0;
  }
  if (!lineBranchHasEnded(branch, referenceDate)) {
    return 1;
  }
  return 2;
}

export function sortLineBranchesForCurrentView<
  T extends LineBranchLifecycleFields,
>(branches: readonly T[], referenceDate = todayIsoDate()) {
  return [...branches].sort(
    (first, second) =>
      branchLifecycleRank(first, referenceDate) -
      branchLifecycleRank(second, referenceDate),
  );
}

export function deriveLineStartedAtFromBranches(
  lineStartedAt: string | null,
  branches: readonly LineBranchLifecycleFields[],
  referenceDate = todayIsoDate(),
) {
  const earliestStartedBranch = branches
    .filter((branch) => !lineBranchHasEnded(branch, referenceDate))
    .map((branch) => branch.startedAt)
    .filter((startedAt): startedAt is string => startedAt != null)
    .sort((first, second) => first.localeCompare(second))[0];

  if (earliestStartedBranch == null) {
    return lineStartedAt;
  }

  if (lineStartedAt == null || lineStartedAt > earliestStartedBranch) {
    return earliestStartedBranch;
  }

  return lineStartedAt;
}

export function countLineStations(
  stationsById: Record<string, LineStationCountStation>,
  lineId: string,
  {
    includePlanned,
    referenceDate = todayIsoDate(),
  }: {
    includePlanned: boolean;
    referenceDate?: string;
  },
) {
  return Object.values(stationsById).filter((station) =>
    station.memberships.some((membership) => {
      if (membership.lineId !== lineId) {
        return false;
      }
      if (membership.endedAt != null && membership.endedAt < referenceDate) {
        return false;
      }
      return includePlanned || membership.startedAt <= referenceDate;
    }),
  ).length;
}
