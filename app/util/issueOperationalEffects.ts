import { ServiceEffectKindSchema, type ServiceEffectKind } from '@mrtdown/core';
import type { Issue, IssueType } from '../client';

type IssueWithServiceEffects = Pick<Issue, 'type'> & {
  serviceEffectKinds: ServiceEffectKind[];
};

function serviceEffectContributesToLineDowntime(kind: ServiceEffectKind) {
  switch (kind) {
    case ServiceEffectKindSchema.enum.delay:
      return false;
    case ServiceEffectKindSchema.enum['no-service']:
    case ServiceEffectKindSchema.enum['reduced-service']:
    case ServiceEffectKindSchema.enum['service-hours-adjustment']:
      return true;
  }
}

export function issueContributesToLineDowntime(issue: IssueWithServiceEffects) {
  if (issue.type === 'disruption') {
    return true;
  }

  return issue.serviceEffectKinds.some(serviceEffectContributesToLineDowntime);
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
