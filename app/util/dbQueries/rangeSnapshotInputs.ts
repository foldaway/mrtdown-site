import { createSelectSchema } from 'drizzle-orm/zod';
import { z } from 'zod';
import {
  impactEventCausesTable,
  impactEventEntityFacilitiesTable,
  impactEventEntityServicesTable,
  impactEventFacilityEffectsTable,
  impactEventPeriodsTable,
  impactEventServiceEffectsTable,
  impactEventServiceScopesTable,
  impactEventsTable,
  issuesTable,
  serviceRevisionPathStationEntriesTable,
} from '~/db/schema';
import type { DatasetInputs } from './dataset';
import { parseDateTime } from './dateTime';
import { RangeReferenceRowsSchema } from './rangeReferences';

const audit = { created_at: true, updated_at: true } as const;
const refs = RangeReferenceRowsSchema.shape;

/** Only canonical inputs used by range assembly; no evidence bodies or reports. */
export const RangeSnapshotInputsSchema = z.object({
  metadataRows: z.array(z.never()),
  operatorsRows: z.array(z.never()),
  townsRows: z.array(z.never()),
  landmarksRows: z.array(z.never()),
  linesRows: refs.lines,
  lineOperatorsRows: refs.lineOperators,
  stationRows: refs.stations,
  stationCodesRows: refs.stationCodes,
  stationLandmarksRows: refs.stationLandmarks,
  serviceRows: refs.services,
  serviceRevisionRows: refs.revisions,
  publicHolidayRows: z.array(z.object({ date: z.iso.date() })),
  issueRows: z.array(createSelectSchema(issuesTable).omit(audit)),
  latestEvidenceRows: z.array(
    z.object({ issue_id: z.string(), latest_ts: z.string().nullable() }),
  ),
  impactEventRows: z.array(
    createSelectSchema(impactEventsTable, {
      type: z.enum([
        'periods.set',
        'causes.set',
        'service_scopes.set',
        'service_effects.set',
        'facility_effects.set',
      ]),
    }).omit(audit),
  ),
  impactEventPeriodRows: z.array(
    createSelectSchema(impactEventPeriodsTable).omit(audit),
  ),
  impactEventServiceRows: z.array(
    createSelectSchema(impactEventEntityServicesTable).omit(audit),
  ),
  impactEventFacilityRows: z.array(
    createSelectSchema(impactEventEntityFacilitiesTable).omit(audit),
  ),
  impactEventCauseRows: z.array(
    createSelectSchema(impactEventCausesTable).omit(audit),
  ),
  impactEventServiceScopeRows: z.array(
    createSelectSchema(impactEventServiceScopesTable).omit(audit),
  ),
  impactEventServiceEffectRows: z.array(
    createSelectSchema(impactEventServiceEffectsTable).omit(audit),
  ),
  impactEventFacilityEffectRows: z.array(
    createSelectSchema(impactEventFacilityEffectsTable).omit(audit),
  ),
  servicePathRows: z.array(
    createSelectSchema(serviceRevisionPathStationEntriesTable).omit(audit),
  ),
});

export function parseRangeSnapshotInputs(value: unknown): DatasetInputs {
  // Drizzle's JSONB schema validates JSON values; domain assembly retains its
  // existing translations/operating-hours validation and canonical semantics.
  return RangeSnapshotInputsSchema.parse(value) as DatasetInputs;
}

/** Match SQL's latest-period candidate selection before clock-dependent assembly. */
export function selectRangeSnapshotInputs(
  inputs: DatasetInputs,
  startMillis: number,
  endMillis: number,
): DatasetInputs {
  const latest = new Map<string, DatasetInputs['impactEventRows'][number]>();
  for (const event of inputs.impactEventRows) {
    if (event.type !== 'periods.set') continue;
    const previous = latest.get(event.issue_id);
    const delta = previous
      ? parseDateTime(event.ts).toMillis() -
        parseDateTime(previous.ts).toMillis()
      : 1;
    if (!previous || delta > 0 || (delta === 0 && event.id > previous.id)) {
      latest.set(event.issue_id, event);
    }
  }
  const overlaps = new Set(
    inputs.impactEventPeriodRows
      .filter(
        (row) =>
          parseDateTime(row.start_at).toMillis() < endMillis &&
          (row.end_at === null ||
            parseDateTime(row.end_at).toMillis() > startMillis),
      )
      .map((row) => row.impact_event_id),
  );
  const ids = new Set(
    [...latest.values()]
      .filter((event) => overlaps.has(event.id))
      .map((event) => event.issue_id),
  );
  // Detail rows are immutable and selected events are assembled only for these
  // issues. Preserve their published order, including membership ordering.
  return {
    ...inputs,
    issueRows: inputs.issueRows.filter((issue) => ids.has(issue.id)),
  };
}
