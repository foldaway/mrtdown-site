import {
  type IssueType,
  ServiceEffectKindSchema,
  type ServiceEffectKind,
} from '@mrtdown/core';

type IssueWithServiceEffects = {
  type: IssueType;
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

  if (issue.type === 'maintenance') {
    return false;
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
