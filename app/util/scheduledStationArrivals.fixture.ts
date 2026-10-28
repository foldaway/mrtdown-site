import {
  type RetainedScheduledDeparture,
  verifyScheduledTimetableArtifact,
} from '@mrtdown/fs';
import type { queryIndexedScheduledDepartures } from './dbQueries/queryIndexedScheduledDepartures';
import {
  retentionBundle,
  retentionReview,
} from './dbQueries/scheduledTimetableRetention.fixture';

const bundle = retentionBundle();
const { manifest } = verifyScheduledTimetableArtifact(
  bundle.files['manifest.json'],
  bundle.entry.manifestSha256,
  {
    timetableBytes: bundle.files['timetable.json'],
    noticeBytes: bundle.files['NOTICE.txt'],
  },
);
export const scope = {
  stationId: 'station',
  lineId: 'line',
  serviceId: 'service',
  destinationStationId: 'destination',
};
export const result: Awaited<
  ReturnType<typeof queryIndexedScheduledDepartures>
> = {
  scope,
  window: {
    startInstant: '2026-10-24T16:00:00Z',
    endInstant: '2026-10-24T17:00:00Z',
  },
  serviceDays: [
    {
      serviceDate: '2026-10-24',
      scope,
      selected: {
        projectionId: 1,
        projectorVersion: 1,
        topology: manifest.identity.topology,
        maximumDepartureSeconds: 90_000,
        completedAt: '2026-10-24T01:00:00Z',
        coverage: {
          activeTripCount: 1,
          unassignedActiveTripCount: 0,
          platformIds: ['a', 'b'],
        },
        version: {
          manifestSha256: bundle.entry.manifestSha256,
          manifest,
          record: {
            schemaVersion: 1,
            documentKind: 'scheduled-timetable-import',
            manifestSha256: bundle.entry.manifestSha256,
            predecessorSha256: null,
            importInstant: '2026-10-24T00:01:00Z',
            sourceReview: retentionReview(bundle),
          },
        },
      },
      attempts: [
        { manifestSha256: bundle.entry.manifestSha256, reason: 'eligible' },
      ],
    },
  ],
  unavailableProjections: [],
  untimedDepartureCount: 0,
  complete: true,
  departures: [],
};
export const departure: RetainedScheduledDeparture = {
  ...scope,
  revisionId: 'dated-revision',
  providerTripId: '000-trip',
  providerRouteId: '000-route',
  providerCalendarId: 'calendar',
  providerStopId: '000-stop',
  stopSequence: '09007199254740993123',
  serviceDate: '2026-10-24',
  platformIds: ['b', 'a'],
  arrivalSeconds: 87_000,
  departureSeconds: 87_000,
  arrivalInstant: '2026-10-24T16:10:00Z',
  departureInstant: '2026-10-24T16:10:00Z',
  pickupType: 0,
  dropOffType: 0,
  timepoint: 1,
  basis: 'scheduled',
  precision: 'exact',
  manifestSha256: bundle.entry.manifestSha256,
  snapshotSha256: manifest.capture.sha256,
  retrievedAt: manifest.capture.retrieved_at,
  correctionRevision: 1,
};
export const display = {
  serviceName: { 'en-SG': 'Service', 'zh-Hans': null, ms: null, ta: null },
  destinationCode: 'D1',
  destinationName: {
    'en-SG': 'Destination',
    'zh-Hans': null,
    ms: null,
    ta: null,
  },
  // Shared labels must never merge distinct canonical platforms.
  platformLabelsById: new Map([
    ['a', 'Platform'],
    ['b', 'Platform'],
  ]),
};
