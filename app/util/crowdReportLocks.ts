type CrowdReportDispatchLockKind = 'cluster' | 'report';

export function buildCrowdReportDispatchLockKey(
  kind: CrowdReportDispatchLockKind,
  id: string,
) {
  return `crowd-report-dispatch:${kind}:${id}`;
}
