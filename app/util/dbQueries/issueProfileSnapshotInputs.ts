import { EvidenceTypeSchema, TranslationsSchema } from '@mrtdown/core';
import type { DateTime } from 'luxon';
import { z } from 'zod';
import {
  assembleDataset,
  type DatasetInputs,
  type DatasetStaticScope,
} from './dataset';
import { selectIncludedEntities } from './includedEntities';
import { RangeSnapshotInputsSchema } from './rangeSnapshotInputs';
import { deriveIssueInitialScope } from './readModelScope';

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
  references: Pick<
    DatasetInputs,
    'impactEventServiceRows' | 'impactEventFacilityRows'
  >,
  updates: IssueUpdate[],
): IssueProfilePartition {
  const eventIds = new Set(
    rows.impactEventRows
      .filter((row) => row.issue_id === issueId)
      .map((row) => row.id),
  );
  const initial = deriveIssueInitialScope({
    facilityRows: references.impactEventFacilityRows.filter((row) =>
      eventIds.has(row.impact_event_id),
    ),
    serviceRows: references.impactEventServiceRows.filter((row) =>
      eventIds.has(row.impact_event_id),
    ),
  });
  const affectedLines = new Set([
    ...initial.lineIds,
    ...rows.serviceRows
      .filter((row) => initial.serviceIds.includes(row.id))
      .map((row) => row.line_id),
  ]);
  const affectedServices = new Set(
    rows.serviceRows
      .filter((row) => affectedLines.has(row.line_id))
      .map((row) => row.id),
  );
  const stationIds = new Set([
    ...initial.stationIds,
    ...rows.servicePathRows
      .filter((row) => affectedServices.has(row.service_id))
      .map((row) => row.station_id),
  ]);
  const lineIds = new Set([
    ...affectedLines,
    ...rows.stationCodesRows
      .filter((row) => stationIds.has(row.station_id))
      .map((row) => row.line_id),
  ]);
  return parseIssueProfilePartition({
    issueId,
    scope: {
      lineIds: [...lineIds],
      serviceIds: rows.serviceRows
        .filter((row) => lineIds.has(row.line_id))
        .map((row) => row.id),
      stationIds: [...stationIds],
    },
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
  const scope: DatasetStaticScope = part.scope;
  const rows: DatasetInputs = {
    ...topology,
    ...part.dataset,
    linesRows: topology.linesRows.filter((row) =>
      scope.lineIds.includes(row.id),
    ),
    lineOperatorsRows: topology.lineOperatorsRows.filter((row) =>
      scope.lineIds.includes(row.line_id),
    ),
    serviceRows: topology.serviceRows.filter((row) =>
      scope.serviceIds.includes(row.id),
    ),
    serviceRevisionRows: topology.serviceRevisionRows.filter((row) =>
      scope.serviceIds.includes(row.service_id),
    ),
    servicePathRows: topology.servicePathRows.filter((row) =>
      scope.serviceIds.includes(row.service_id),
    ),
    stationRows: topology.stationRows.filter((row) =>
      scope.stationIds.includes(row.id),
    ),
    stationCodesRows: topology.stationCodesRows.filter((row) =>
      scope.stationIds.includes(row.station_id),
    ),
    stationLandmarksRows: topology.stationLandmarksRows.filter((row) =>
      scope.stationIds.includes(row.station_id),
    ),
  } as DatasetInputs;
  return assembleIssueProfile(
    part.issueId,
    assembleDataset(now, rows, scope),
    part.updates,
  );
}
