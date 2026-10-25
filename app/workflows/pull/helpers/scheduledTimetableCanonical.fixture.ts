import {
  LineSchema,
  type Manifest,
  OperatorSchema,
  type ScheduledTripPattern,
  ServiceSchema,
  StationSchema,
} from '@mrtdown/core';
import { hashBytes, scheduleTopologyProjection } from '@mrtdown/fs';

// Two stations and one assigned source trip; no GTFS producer fixture needed.
export function scheduledTimetableCanonicalFixture() {
  const name = { 'en-SG': 'Test', 'zh-Hans': null, ms: null, ta: null };
  const operators = [
    OperatorSchema.parse({
      id: 'operator',
      name,
      foundedAt: '2000-01-01',
      url: null,
    }),
  ];
  const lines = [
    LineSchema.parse({
      id: 'line',
      name,
      type: 'mrt.high',
      color: '#000000',
      startedAt: '2000-01-01',
      platformDoorCount: 24,
      trainCarCounts: [6],
      serviceIds: ['service'],
      operators: [
        { operatorId: 'operator', startedAt: '2000-01-01', endedAt: null },
      ],
    }),
  ];
  const stations = [1, 2].map((number) =>
    StationSchema.parse({
      id: `station-${number}`,
      name,
      geo: { latitude: 1, longitude: 103 },
      stationCodes: [
        {
          lineId: 'line',
          code: `T${number}`,
          startedAt: '2000-01-01',
          endedAt: null,
          structureType: 'underground',
        },
      ],
      landmarkIds: [],
      townId: 'town',
      layout: {
        platforms: [
          {
            id: `platform-${number}`,
            label: 'A',
            lastUpdated: '2026-10-24',
            lineId: 'line',
          },
        ],
      },
    }),
  );
  const services = [
    ServiceSchema.parse({
      id: 'service',
      name,
      lineId: 'line',
      revisions: [
        {
          id: 'revision',
          startAt: '2000-01-01',
          endAt: null,
          path: {
            stations: stations.map(({ id }, index) => ({
              stationId: id,
              displayCode: `T${index + 1}`,
            })),
          },
          operatingHours: {
            weekdays: { start: '05:00:00', end: '23:00:00' },
            weekends: { start: '05:00:00', end: '23:00:00' },
          },
        },
      ],
    }),
  ];
  const canonical = { operators, lines, stations, services };
  const pattern: ScheduledTripPattern = {
    lineId: 'line',
    serviceId: 'service',
    revisionId: 'revision',
    destinationStationId: 'station-2',
    stops: stations.map(({ id }, index) => ({
      stationId: id,
      platformIds: [`platform-${index + 1}`],
    })),
  };
  function archive() {
    const records = {
      operator: operators,
      line: lines,
      station: stations,
      service: services,
    };
    const files: Record<string, Uint8Array> = {};
    const manifest: Manifest = {
      manifestVersion: 2,
      generatedAt: '2026-10-24T00:00:00Z',
      lines: {},
      stations: {},
      operators: {},
      services: {},
      towns: {},
      landmarks: {},
      issues: {},
      rights: { licenseData: 'test', sourceRegistry: 'test' },
    };
    for (const [collection, values] of Object.entries(records)) {
      const hashes = manifest[`${collection}s` as keyof typeof canonical];
      for (const value of values) {
        hashes[value.id] = hashBytes(Buffer.from(JSON.stringify(value)));
        files[`data/${collection}/${value.id}.json`] = Buffer.from(
          `${JSON.stringify(value, null, 2)}\n`,
        );
      }
    }
    return { manifest, files };
  }
  return {
    canonical,
    pattern,
    archive,
    topology: () => scheduleTopologyProjection(canonical),
  };
}
