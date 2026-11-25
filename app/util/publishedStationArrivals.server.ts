import { ScheduledTimetableRequestScopeSchema } from '@mrtdown/fs';
import { getDb } from '~/db';
import { readCompletedPageProfileGeneration } from '~/db/pageProfileGeneration';
import {
  arrivalDepartureStore,
  type DeparturePartitionRef,
} from './arrivalDepartureStore.server';
import { arrivalInputSnapshotStore } from './arrivalInputSnapshot.server';
import {
  type ArrivalInputs,
  readArrivalInputHistory,
  selectArrivalInputCoverage,
} from './dbQueries/arrivalInputs';
import {
  type DeparturePartition,
  expandDeparturePartition,
} from './dbQueries/departurePartition';
import {
  assembleIndexedScheduledDepartures,
  exactServiceDeparture,
} from './dbQueries/queryIndexedScheduledDepartures';
import {
  assembleStationArrivalSource,
  type StationArrivalRequest,
} from './dbQueries/readStationArrivalSource';
import { createTimetableSelectionPolicy } from './dbQueries/scheduledTimetableSelection';
import {
  InvalidStationArrivalScopeError,
  validateTimetableScope,
} from './dbQueries/withSelectedScheduledTimetable';

/** Null selects SQL recovery. A valid covered-empty result is still a hit. */
export async function readPublishedStationArrivals(
  options: StationArrivalRequest,
) {
  if (!process.env.REDIS_URL) return null;
  let generation: string | undefined;
  try {
    const [metadata, departures] = await Promise.all([
      arrivalInputSnapshotStore.read(),
      arrivalDepartureStore.manifest.read(),
    ]);
    // Separate producer steps can expose different heads during promotion.
    // Only a manifest bound to these exact metadata bytes is coherent.
    if (
      !metadata ||
      !departures ||
      metadata.value.generation !== departures.value.generation ||
      metadata.value.fingerprint !== departures.value.fingerprint ||
      metadata.value.sha256 !== departures.inputs.arrivalInputsSha256
    )
      return null;
    generation = metadata.value.generation;
    return await assemblePublishedStationArrivals(
      options,
      metadata.inputs,
      departures.inputs.partitions,
    );
  } catch (error) {
    if (error instanceof InvalidStationArrivalScopeError) {
      // A promotion can add scopes before its snapshots publish. Only rejected
      // scopes consult SQL generation; healthy published reads never open SQL.
      const current = await readCompletedPageProfileGeneration(getDb());
      if (current === generation) throw error;
      return null;
    }
    console.error('Published station arrivals unavailable; using SQL', {
      error,
    });
    return null;
  }
}

/** Assemble source inputs at the request clock, never memoize a finished response. */
export async function assemblePublishedStationArrivals(
  options: StationArrivalRequest,
  inputs: ArrivalInputs,
  refs: DeparturePartitionRef[],
) {
  const scope = ScheduledTimetableRequestScopeSchema.parse(options.scope);
  if (scope.serviceId === undefined)
    throw new Error('Expected exact arrival service');
  const { matchesPlatformDefaults, loopRevisions } = validateTimetableScope(
    scope,
    inputs.topology,
    options.loop,
  );
  const history = readArrivalInputHistory(inputs);
  const policy = createTimetableSelectionPolicy({
    scope,
    topology: inputs.topology,
    history,
    indexed: inputs.projections,
    loop: options.loop,
    loopRevisions,
    rollback: options.rollback,
  });
  const platformId = scope.platformId;
  if (!matchesPlatformDefaults && platformId !== undefined) {
    const eligible = new Set(
      history.flatMap((version) => {
        const projection = policy.projectionFor(version);
        return version.format === 'combined' &&
          projection &&
          !policy.projectionReason(version)
          ? [projection.id]
          : [];
      }),
    );
    if (
      !inputs.scopes.some(
        (row) =>
          eligible.has(row.projection_id) &&
          row.station_id === scope.stationId &&
          row.line_id === scope.lineId &&
          row.service_id === scope.serviceId &&
          (options.loop ||
            row.destination_station_id === scope.destinationStationId) &&
          row.platform_ids.includes(platformId),
      )
    ) {
      throw new InvalidStationArrivalScopeError(
        'Timetable request platform does not belong to its station, line and service',
      );
    }
  }
  const partitions = new Map<number, DeparturePartition>();
  const result = await assembleIndexedScheduledDepartures(
    { ...options, scope, startInstant: options.referenceInstant },
    {
      ...policy,
      scope,
      topology: inputs.topology,
      select: async (date) =>
        policy.select(
          date,
          selectArrivalInputCoverage(inputs, scope, date, options.loop),
        ),
    },
    async (_scope, destinations, selected, date, lower, upper) => {
      const { projectionId } = selected;
      let partition = partitions.get(projectionId);
      if (!partition) {
        const ref = refs.find(
          (ref) =>
            ref.projectionId === projectionId &&
            ref.stationId === scope.stationId,
        );
        // Absence is unavailable, never an authoritative empty station.
        if (!ref) throw new Error('Missing required departure partition');
        partition = await arrivalDepartureStore.read(ref);
        partitions.set(projectionId, partition);
      }
      const lowerInstant = Date.parse(lower);
      const upperInstant = Date.parse(upper);
      const rows = [];
      let count = 0;
      for (const row of expandDeparturePartition(partition, date)) {
        if (
          row.service_date !== date ||
          row.line_id !== scope.lineId ||
          !destinations.includes(row.destination_station_id)
        )
          continue;
        const boardingByService = row.boardingByService.filter(
          (member) =>
            member.serviceId === scope.serviceId &&
            (scope.platformId === undefined ||
              member.platformIds.includes(scope.platformId)),
        );
        if (!boardingByService.length) continue;
        if (row.departure_instant === null) {
          count++;
          continue;
        }
        // Whole-second source offsets compare against the shared ceiling bounds.
        const at = Date.parse(row.departure_instant);
        if (at < lowerInstant || at >= upperInstant) continue;
        const { platform_semantics, ...call } = row;
        rows.push({
          ...call,
          boardingByService,
          ...(selected.version.format === 'combined'
            ? { platform_semantics }
            : {}),
        });
      }
      return { rows, untimed: { count } };
    },
    exactServiceDeparture,
  );
  const station = inputs.stationNames.find(({ id }) => id === scope.stationId);
  const destination = inputs.stationNames.find(
    ({ id }) => id === scope.destinationStationId,
  );
  const service = inputs.serviceNames.find(({ id }) => id === scope.serviceId);
  if (!station || !destination || !service)
    throw new Error('Missing arrival display metadata');
  return {
    inputs,
    decision: assembleStationArrivalSource(result, inputs.topology, {
      serviceName: service.name,
      destinationName: destination.name,
    }),
  };
}
