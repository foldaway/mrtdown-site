import type {
  impactEventServiceScopesTable,
  impactEventsTable,
} from '~/db/schema';

type ImpactEventServiceScopeRow = Pick<
  typeof impactEventServiceScopesTable.$inferSelect,
  'type' | 'station_id' | 'from_station_id' | 'to_station_id'
>;

export function deriveServiceScopeStationIds(
  branchStationIds: readonly string[],
  scopeRows: readonly ImpactEventServiceScopeRow[],
) {
  if (scopeRows.length === 0) {
    return [...branchStationIds];
  }

  if (scopeRows.some((scope) => scope.type === 'service.whole')) {
    return [...branchStationIds];
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
