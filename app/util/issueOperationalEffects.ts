import type { Issue, IssueType } from '../client';

type IssueWithServiceEffects = Pick<Issue, 'type'> & {
  serviceEffectKinds: string[];
};

const LINE_DOWNTIME_SERVICE_EFFECT_KINDS = new Set([
  'no-service',
  'reduced-service',
  'service-hours-adjustment',
]);

export function issueContributesToLineDowntime(
  issue: IssueWithServiceEffects,
) {
  if (issue.type === 'disruption') {
    return true;
  }

  return issue.serviceEffectKinds.some((kind) =>
    LINE_DOWNTIME_SERVICE_EFFECT_KINDS.has(kind),
  );
}

export function issueContributesToLineStatus(
  issue: IssueWithServiceEffects,
) {
  return issueContributesToLineDowntime(issue);
}

export function issueTypeHasLineDowntimeByServiceEffect(
  issueType: IssueType,
  serviceEffectKinds: string[],
) {
  return issueContributesToLineDowntime({
    type: issueType,
    serviceEffectKinds,
  });
}
