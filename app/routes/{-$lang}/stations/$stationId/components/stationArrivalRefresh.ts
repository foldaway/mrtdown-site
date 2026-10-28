import type { StationArrivalsV2 } from '~/util/stationArrivalsV2';
import type { ArrivalLine } from './stationGuide.types';
import { parseArrivalResponse } from './stationArrivalResponse';

export type BranchArrivalState = {
  data: StationArrivalsV2 | null;
  status: 'loading' | 'ready' | 'error';
};
export type ArrivalStates = Record<string, BranchArrivalState>;

export function arrivalBranchKey(
  lineId: string,
  serviceId: string,
  destinationStationId: string | null,
) {
  return JSON.stringify([lineId, serviceId, destinationStationId]);
}

export function createArrivalRefresh(
  stationId: string,
  lines: ArrivalLine[],
  onChange: (states: ArrivalStates) => void,
  fetchResponse: typeof fetch = fetch,
) {
  const branches = new Map<string, StationArrivalsV2['scope']>();
  for (const line of lines) {
    for (const timing of line.arrivalTimings) {
      if (timing.destinationStationId == null) {
        continue;
      }
      branches.set(
        arrivalBranchKey(
          line.lineId,
          timing.serviceId,
          timing.destinationStationId,
        ),
        {
          stationId,
          lineId: line.lineId,
          serviceId: timing.serviceId,
          destinationStationId: timing.destinationStationId,
        },
      );
    }
  }
  let states: ArrivalStates = {};
  let active: { controller: AbortController; promise: Promise<void> } | null =
    null;
  let generation = 0;
  let disposed = false;
  const refresh = (): Promise<void> => {
    if (disposed) {
      return Promise.resolve();
    }
    if (active) {
      return active.promise;
    }
    const currentGeneration = ++generation;
    const controller = new AbortController();
    const isCurrent = () => !disposed && generation === currentGeneration;
    for (const key of branches.keys()) {
      states = {
        ...states,
        [key]: { data: states[key]?.data ?? null, status: 'loading' },
      };
    }
    onChange(states);
    const queue = [...branches];
    const timeout = setTimeout(() => {
      controller.abort();
      if (isCurrent()) {
        states = Object.fromEntries(
          Object.entries(states).map(([key, state]) => [
            key,
            state.status === 'loading' ? { ...state, status: 'error' } : state,
          ]),
        );
        onChange(states);
      }
    }, 15_000);
    const worker = async () => {
      while (queue.length > 0 && !controller.signal.aborted && isCurrent()) {
        const branch = queue.shift();
        if (!branch) {
          return;
        }
        const [key, scope] = branch;
        try {
          const query = new URLSearchParams({
            lineId: scope.lineId,
            serviceId: scope.serviceId,
            destinationStationId: scope.destinationStationId,
          });
          const response = await fetchResponse(
            `/api/stations/${encodeURIComponent(stationId)}/arrivals/v2?${query}`,
            {
              cache: 'no-store',
              signal: controller.signal,
            },
          );
          if (!response.ok) {
            throw new Error('Arrival refresh failed');
          }
          const data = parseArrivalResponse(await response.json(), scope);
          if (isCurrent() && !controller.signal.aborted) {
            states = { ...states, [key]: { data, status: 'ready' } };
            onChange(states);
          }
        } catch {
          if (isCurrent() && !controller.signal.aborted) {
            states = {
              ...states,
              [key]: { data: states[key]?.data ?? null, status: 'error' },
            };
            onChange(states);
          }
        }
      }
    };
    const promise = Promise.all([worker(), worker()])
      .then(() => {})
      .finally(() => {
        clearTimeout(timeout);
        if (isCurrent()) {
          active = null;
        }
      });
    active = { controller, promise };
    return promise;
  };
  return {
    refresh,
    dispose() {
      disposed = true;
      generation++;
      active?.controller.abort();
    },
  };
}
