import type {
  impactEventServiceScopesTable,
  impactEventsTable,
} from '~/db/schema';
import { parseDateTime } from './dateTime';

type ImpactEventServiceScopeRow = Pick<
  typeof impactEventServiceScopesTable.$inferSelect,
  'type' | 'station_id' | 'from_station_id' | 'to_station_id'
>;

export function deriveServiceScopeStationIds(
  branchStationIds: readonly string[],
  scopeRows: readonly ImpactEventServiceScopeRow[],
  wholeServiceStationIds: readonly string[] = branchStationIds,
) {
  if (scopeRows.length === 0) {
    return [...branchStationIds];
  }

  if (scopeRows.some((scope) => scope.type === 'service.whole')) {
    return [...wholeServiceStationIds];
  }

  const stationIds = new Set<string>();

  for (const scope of scopeRows) {
    switch (scope.type) {
      case 'service.point': {
        if (
          scope.station_id != null &&
          branchStationIds.includes(scope.station_id)
        ) {
          stationIds.add(scope.station_id);
        }
        break;
      }
      case 'service.segment': {
        if (scope.from_station_id == null || scope.to_station_id == null) {
          break;
        }

        const fromIndex = branchStationIds.indexOf(scope.from_station_id);
        const toIndex = branchStationIds.indexOf(scope.to_station_id);
        if (fromIndex === -1 || toIndex === -1) {
          break;
        }

        const startIndex = Math.min(fromIndex, toIndex);
        const endIndex = Math.max(fromIndex, toIndex);
        for (let index = startIndex; index <= endIndex; index++) {
          const stationId = branchStationIds[index];
          if (stationId != null) {
            stationIds.add(stationId);
          }
        }
        break;
      }
    }
  }

  const scopedStationIds = branchStationIds.filter((stationId) =>
    stationIds.has(stationId),
  );
  return scopedStationIds.length > 0 ? scopedStationIds : [...branchStationIds];
}

type ImpactEventStateRow = Pick<
  typeof impactEventsTable.$inferSelect,
  'id' | 'type'
>;

export function selectServiceBranchSourceEvents<T extends ImpactEventStateRow>(
  selectedStateEvents: readonly T[],
) {
  const serviceScopeEvents = selectedStateEvents.filter(
    (event) => event.type === 'service_scopes.set',
  );

  return serviceScopeEvents.length > 0
    ? serviceScopeEvents
    : selectedStateEvents;
}

type ServiceEventCandidate = ImpactEventStateRow & {
  issue_id: string;
  ts: string;
};

type ServiceEventReference = {
  impact_event_id: string;
  service_id: string;
};

export function selectLatestServiceEvents<
  T extends ServiceEventCandidate,
  R extends ServiceEventReference,
>(
  events: readonly T[],
  serviceReferences: readonly R[],
  issueId: string,
  eventType: T['type'],
) {
  const eventById = new Map(events.map((event) => [event.id, event]));
  const latestByServiceId = new Map<string, T>();

  for (const reference of serviceReferences) {
    const event = eventById.get(reference.impact_event_id);
    if (
      event == null ||
      event.issue_id !== issueId ||
      event.type !== eventType
    ) {
      continue;
    }

    const current = latestByServiceId.get(reference.service_id);
    if (current == null) {
      latestByServiceId.set(reference.service_id, event);
      continue;
    }

    const tsDiff =
      parseDateTime(event.ts).toMillis() - parseDateTime(current.ts).toMillis();
    if (tsDiff > 0 || (tsDiff === 0 && event.id > current.id)) {
      latestByServiceId.set(reference.service_id, event);
    }
  }

  return [...latestByServiceId.values()];
}
