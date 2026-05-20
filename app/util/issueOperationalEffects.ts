import {
  type IssueType,
  ServiceEffectKindSchema,
  type ServiceEffectKind,
} from '@mrtdown/core';

type IssueWithServiceEffects = {
  type: IssueType;
  serviceEffectKinds: ServiceEffectKind[];
};

function serviceEffectContributesToLineStatus(kind: ServiceEffectKind) {
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
  return issue.type === 'disruption';
}

export function issueContributesToLineStatus(issue: IssueWithServiceEffects) {
  return (
    issue.type === 'disruption' ||
    issue.serviceEffectKinds.some(serviceEffectContributesToLineStatus)
  );
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
