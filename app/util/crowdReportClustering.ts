import type { CrowdReportEffect } from './crowdReports';

export type CrowdReportClusterContext = {
  lineIds: string[];
  stationIds: string[];
  directionText?: string | null;
  effect?: CrowdReportEffect | null;
};

function normalizeIds(values: string[]) {
  return [...new Set(values)].sort();
}

function haveSameIds(left: string[], right: string[]) {
  const leftIds = normalizeIds(left);
  const rightIds = normalizeIds(right);
  return (
    leftIds.length === rightIds.length &&
    leftIds.every((id, index) => id === rightIds[index])
  );
}

export function normalizeCrowdReportDirection(value?: string | null) {
  const direction = value?.trim().toLowerCase() ?? '';
  return direction === 'not-sure' ? '' : direction;
}

export function getCrowdReportClusterDirection(
  reportsNewestFirst: ReadonlyArray<{ directionText: string | null }>,
) {
  // Source and dispatch queries order eligible reports newest first. A newer
  // unspecified direction must not erase a known direction from the cluster.
  const latestSpecified = reportsNewestFirst.find((report) =>
    normalizeCrowdReportDirection(report.directionText),
  );
  return (
    latestSpecified?.directionText ??
    reportsNewestFirst[0]?.directionText ??
    null
  );
}

export function buildCrowdReportClusteringLockKey(
  context: CrowdReportClusterContext,
) {
  // Variations that can match must acquire the same lock, including unknown
  // effects/directions and reports naming different stations on one line.
  return `crowd-report-clustering:${JSON.stringify(
    context.lineIds.length > 0
      ? { lineIds: normalizeIds(context.lineIds) }
      : { stationIds: normalizeIds(context.stationIds) },
  )}`;
}

export function crowdReportContextsMatch(
  left: CrowdReportClusterContext,
  right: CrowdReportClusterContext,
) {
  const leftDirection = normalizeCrowdReportDirection(left.directionText);
  const rightDirection = normalizeCrowdReportDirection(right.directionText);
  if (leftDirection && rightDirection && leftDirection !== rightDirection) {
    return false;
  }
  if (
    left.effect &&
    left.effect !== 'unknown' &&
    right.effect &&
    right.effect !== 'unknown' &&
    left.effect !== right.effect
  ) {
    return false;
  }

  // Line incidents may have observations at several stations. Without line
  // context, require the same station set rather than guessing connectivity.
  if (left.lineIds.length > 0 || right.lineIds.length > 0) {
    return left.lineIds.length > 0 && haveSameIds(left.lineIds, right.lineIds);
  }
  return (
    left.stationIds.length > 0 && haveSameIds(left.stationIds, right.stationIds)
  );
}
