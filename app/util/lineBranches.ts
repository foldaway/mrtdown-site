type LineBranchLifecycleFields = {
  startedAt: string | null;
  endedAt: string | null;
};

function branchLifecycleRank(branch: LineBranchLifecycleFields) {
  if (branch.startedAt != null && branch.endedAt == null) {
    return 0;
  }
  if (branch.startedAt == null && branch.endedAt == null) {
    return 1;
  }
  return 2;
}

export function sortLineBranchesForCurrentView<
  T extends LineBranchLifecycleFields,
>(branches: readonly T[]) {
  return [...branches].sort(
    (first, second) => branchLifecycleRank(first) - branchLifecycleRank(second),
  );
}

export function deriveLineStartedAtFromBranches(
  lineStartedAt: string | null,
  branches: readonly LineBranchLifecycleFields[],
) {
  const earliestStartedBranch = branches
    .filter((branch) => branch.endedAt == null)
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
