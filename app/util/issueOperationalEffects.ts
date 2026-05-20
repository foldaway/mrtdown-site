import { ServiceEffectKindSchema, type ServiceEffectKind } from '@mrtdown/core';
import type { Issue, IssueType } from '../client';

type IssueWithServiceEffects = Pick<Issue, 'type'> & {
  serviceEffectKinds: ServiceEffectKind[];
};

const LINE_DOWNTIME_SERVICE_EFFECT_KINDS: ReadonlySet<ServiceEffectKind> =
  new Set([
    ServiceEffectKindSchema.enum['no-service'],
    ServiceEffectKindSchema.enum['reduced-service'],
    ServiceEffectKindSchema.enum['service-hours-adjustment'],
  ]);

export function issueContributesToLineDowntime(issue: IssueWithServiceEffects) {
  if (issue.type === 'disruption') {
    return true;
  }

  return issue.serviceEffectKinds.some((kind) =>
    LINE_DOWNTIME_SERVICE_EFFECT_KINDS.has(kind),
  );
}

export function issueContributesToLineStatus(issue: IssueWithServiceEffects) {
  return issueContributesToLineDowntime(issue);
}

export function issueTypeHasLineDowntimeByServiceEffect(
  issueType: IssueType,
  serviceEffectKinds: ServiceEffectKind[],
) {
  return issueContributesToLineDowntime({
    type: issueType,
    serviceEffectKinds,
  });
}
