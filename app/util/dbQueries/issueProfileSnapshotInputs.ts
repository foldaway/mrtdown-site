import { EvidenceTypeSchema, TranslationsSchema } from '@mrtdown/core';
import type { DateTime } from 'luxon';
import { z } from 'zod';
import {
  assembleDataset,
  type DatasetInputs,
  scopeDatasetInputs,
} from './dataset';
import { selectIncludedEntities } from './includedEntities';
import { RangeSnapshotInputsSchema } from './rangeSnapshotInputs';
import { getIssueScopeFromInputs } from './readModelScope';

const issueFields = {
  issueRows: true,
  latestEvidenceRows: true,
  impactEventRows: true,
  impactEventPeriodRows: true,
  impactEventServiceRows: true,
  impactEventFacilityRows: true,
  impactEventCauseRows: true,
  impactEventServiceScopeRows: true,
  impactEventServiceEffectRows: true,
  impactEventFacilityEffectRows: true,
} as const;
export const IssueProfileTopologySchema =
  RangeSnapshotInputsSchema.omit(issueFields);
const IssueInputsSchema = RangeSnapshotInputsSchema.pick(issueFields).extend({
  // Assembly never uses title metadata. Do not publish its source material.
  issueRows: z
    .array(
      RangeSnapshotInputsSchema.shape.issueRows.element.extend({
        title_meta: z.null(),
      }),
    )
    .length(1),
});
const UpdateSchema = z
  .object({
    type: EvidenceTypeSchema,
    text: z.string(),
    textTranslations: TranslationsSchema.nullable(),
    isTextRedacted: z.boolean(),
    sourceUrl: z.string(),
    createdAt: z.string(),
  })
  .refine(
    (update) =>
      !update.isTextRedacted ||
      (update.text === '' && update.textTranslations === null),
  );
const PartitionSchema = z.object({
  issueId: z.string().min(1).max(256),
  scope: z.object({
    lineIds: z.array(z.string()),
    serviceIds: z.array(z.string()),
    stationIds: z.array(z.string()),
  }),
  dataset: IssueInputsSchema,
  updates: z.array(UpdateSchema),
});
export type IssueProfilePartition = z.infer<typeof PartitionSchema>;
export type IssueProfileTopology = z.infer<typeof IssueProfileTopologySchema>;
export type IssueUpdate = z.infer<typeof UpdateSchema>;
export function parseIssueProfilePartition(value: unknown) {
  const part = PartitionSchema.parse(value);
  if (
    part.dataset.issueRows[0].id !== part.issueId ||
    part.dataset.impactEventRows.some((row) => row.issue_id !== part.issueId) ||
    part.dataset.latestEvidenceRows.some((row) => row.issue_id !== part.issueId)
  )
    throw new Error('Issue partition identity mismatch');
  return part;
}

/** Mirror getIssueStaticScope, including superseded references and all revisions. */
export function selectIssueProfilePartition(
  rows: DatasetInputs,
  issueId: string,
  updates: IssueUpdate[],
): IssueProfilePartition {
  const eventIds = new Set(
    rows.impactEventRows
      .filter((row) => row.issue_id === issueId)
      .map((row) => row.id),
  );
  return parseIssueProfilePartition({
    issueId,
    scope: getIssueScopeFromInputs(rows, new Set([issueId])),
    dataset: {
      issueRows: rows.issueRows
        .filter((row) => row.id === issueId)
        .map((row) => ({ ...row, title_meta: null })),
      latestEvidenceRows: rows.latestEvidenceRows.filter(
        (row) => row.issue_id === issueId,
      ),
      impactEventRows: rows.impactEventRows.filter(
        (row) => row.issue_id === issueId,
      ),
      impactEventPeriodRows: rows.impactEventPeriodRows.filter((row) =>
        eventIds.has(row.impact_event_id),
      ),
      impactEventServiceRows: rows.impactEventServiceRows.filter((row) =>
        eventIds.has(row.impact_event_id),
      ),
      impactEventFacilityRows: rows.impactEventFacilityRows.filter((row) =>
        eventIds.has(row.impact_event_id),
      ),
      impactEventCauseRows: rows.impactEventCauseRows.filter((row) =>
        eventIds.has(row.impact_event_id),
      ),
      impactEventServiceScopeRows: rows.impactEventServiceScopeRows.filter(
        (row) => eventIds.has(row.impact_event_id),
      ),
      impactEventServiceEffectRows: rows.impactEventServiceEffectRows.filter(
        (row) => eventIds.has(row.impact_event_id),
      ),
      impactEventFacilityEffectRows: rows.impactEventFacilityEffectRows.filter(
        (row) => eventIds.has(row.impact_event_id),
      ),
    },
    updates,
  });
}

export function assembleIssueProfile(
  issueId: string,
  dataset: ReturnType<typeof assembleDataset>,
  updates: IssueUpdate[],
) {
  if (!dataset.allIssues[issueId])
    throw new Error(
      `Issue ${issueId} disappeared while building its read model`,
    );
  return {
    data: { id: issueId, updates },
    included: selectIncludedEntities(dataset.included, dataset.allIssues, {
      issueIds: [issueId],
      includeStationMembershipLines: true,
    }),
  };
}

export function assembleIssueProfileSnapshot(
  topology: IssueProfileTopology,
  part: IssueProfilePartition,
  now: DateTime,
) {
  const rows = scopeDatasetInputs(
    { ...topology, ...part.dataset } as DatasetInputs,
    part.scope,
    new Set([part.issueId]),
  );
  return assembleIssueProfile(
    part.issueId,
    assembleDataset(now, rows, part.scope),
    part.updates,
  );
}
