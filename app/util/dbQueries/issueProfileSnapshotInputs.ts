import { EvidenceTypeSchema, TranslationsSchema } from '@mrtdown/core';
import type { DateTime } from 'luxon';
import { z } from 'zod';
import {
  assembleDataset,
  completeLineIdsFromInputs,
  type DatasetInputs,
  scopeDatasetInputs,
} from './dataset';
import { selectIncludedEntities } from './includedEntities';
import { RangeSnapshotInputsSchema } from './rangeSnapshotInputs';
import { getIssueScopeFromInputs } from './readModelScope';

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
const schema = z.object({
  dataset: RangeSnapshotInputsSchema.extend({
    // Assembly never uses title metadata. Do not publish its source material.
    issueRows: z
      .array(
        RangeSnapshotInputsSchema.shape.issueRows.element.extend({
          title_meta: z.null(),
        }),
      )
      .max(10_000),
  }),
  updates: z.record(z.string(), z.array(UpdateSchema)),
});
export type IssueUpdate = z.infer<typeof UpdateSchema>;
export type IssueProfileSnapshotInputs = {
  dataset: DatasetInputs;
  updates: Record<string, IssueUpdate[]>;
};
export function parseIssueProfileSnapshotInputs(
  value: unknown,
): IssueProfileSnapshotInputs {
  const inputs = schema.parse(value);
  const ids = inputs.dataset.issueRows.map((row) => row.id);
  if (
    new Set(ids).size !== ids.length ||
    ids.length !== Object.keys(inputs.updates).length ||
    ids.some((id) => !Object.hasOwn(inputs.updates, id))
  )
    throw new Error('Issue Profile inputs are incomplete');
  return inputs as IssueProfileSnapshotInputs;
}

export function selectIssueProfileSnapshot(
  inputs: IssueProfileSnapshotInputs,
  issueId: string,
) {
  // An absent ID may have been promoted since publication; retain SQL recovery.
  if (!Object.hasOwn(inputs.updates, issueId)) return null;
  const ids = new Set([issueId]);
  const dataset = scopeDatasetInputs(
    inputs.dataset,
    getIssueScopeFromInputs(inputs.dataset, ids),
    ids,
  );
  return {
    issueId,
    dataset,
    completeLineIds: completeLineIdsFromInputs(inputs.dataset, dataset),
    updates: inputs.updates[issueId],
  };
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
  inputs: NonNullable<ReturnType<typeof selectIssueProfileSnapshot>>,
  now: DateTime,
) {
  return assembleIssueProfile(
    inputs.issueId,
    assembleDataset(now, inputs.dataset, undefined, inputs.completeLineIds),
    inputs.updates,
  );
}
