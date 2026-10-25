import type { ScheduledTimetableSourceReview } from '@mrtdown/core';
import { prepareScheduledTimetableArtifact } from '@mrtdown/fs';
import type { VerifiedScheduledTimetableBundle } from './retainScheduledTimetable';

// One source trip, no canonical allocation or producer pipeline. The four
// opaque companion files exercise storage only, not publication verification.
export function retentionBundle(source = 'a', revision = 1) {
  const artifact = prepareScheduledTimetableArtifact(
    {
      schemaVersion: 1,
      timetable: {
        schemaVersion: 1,
        timeZone: 'Asia/Singapore',
        calendars: [
          {
            providerCalendarId: 'day',
            weekly: null,
            exceptions: [{ date: '2026-10-24', available: true }],
          },
        ],
        trips: [
          {
            providerTripId: 'trip',
            providerRouteId: 'route',
            providerCalendarId: 'day',
            stopTimes: [1, 2].map((stop) => ({
              providerTripId: 'trip',
              providerStopId: `stop-${stop}`,
              stopSequence: `${stop}`,
              arrivalSeconds: stop * 60,
              departureSeconds: stop * 60,
              pickupType: 0,
              dropOffType: 0,
              timepoint: 1,
            })),
          },
        ],
      },
      patterns: [],
      assignments: [],
    },
    {
      schemaVersion: 1,
      documentKind: 'scheduled-timetable-artifact',
      correctionRevision: revision,
      capture: {
        schema_version: 1,
        capture_id: `capture-${source}`,
        feed_kind: 'schedule',
        source:
          'https://datamall2.mytransport.sg/ltaodataservice/GTFSScheduleTrain',
        retrieved_at: '2026-10-24T00:00:00Z',
        provider_timestamp: null,
        sha256: source.repeat(64),
        byte_length: 100,
        archive_ref: `archive-${source}`,
        attribution: 'Synthetic test source',
        rights_status: 'redistribution_permitted',
        licence_reference: 'https://example.com/licence',
      },
      identity: {
        sourceManifest: {},
        canonicalCommit: 'a'.repeat(40),
        topology: { projectionVersion: 1, sha256: 'a'.repeat(64) },
      },
      mapping: {
        version: 'test',
        draftSha256: 'b'.repeat(64),
        assignmentsSha256: 'c'.repeat(64),
      },
      feedRange: { startDate: '2026-10-24', endDate: '2026-10-24' },
      sourceFeedInfo: [
        {
          feed_version: source === 'a' ? 'zzz' : 'aaa',
          feed_start_date: '20261024',
          feed_end_date: '20261024',
        },
      ],
      currentLicenceReference: 'https://example.com/licence',
      mrtdownLicence: 'CC-BY-4.0',
    },
  );
  const bundle: VerifiedScheduledTimetableBundle = {
    entry: {
      manifestSha256: artifact.manifestSha256,
      releaseSha256: 'd'.repeat(64),
      capture: {
        ...artifact.manifest.capture,
        rights_status: 'redistribution_permitted',
      },
      feedRange: artifact.manifest.feedRange,
      currentLicenceReference: artifact.manifest.currentLicenceReference,
      coverage: {
        sourceTripDateCount: 1,
        assignedTripDateCount: 0,
        missingTripDateCount: 1,
      },
    },
    files: {
      'manifest.json': artifact.manifestBytes,
      'timetable.json': artifact.timetableBytes,
      'NOTICE.txt': artifact.noticeBytes,
      'release.json': Buffer.from('synthetic release\n'),
      'mapping-draft.json': Buffer.from('synthetic draft\n'),
      'mapping-approval.json': Buffer.from('synthetic approval\n'),
      'release-review.json': Buffer.from('synthetic review\n'),
    },
  };
  return bundle;
}

export function retentionReview(
  candidate: VerifiedScheduledTimetableBundle,
  predecessor?: VerifiedScheduledTimetableBundle,
  decision: ScheduledTimetableSourceReview['decision'] = predecessor
    ? 'successor'
    : 'baseline',
): ScheduledTimetableSourceReview {
  return {
    schemaVersion: 1,
    documentKind: 'scheduled-timetable-source-review',
    decision,
    predecessor: predecessor
      ? {
          manifestSha256: predecessor.entry.manifestSha256,
          snapshotSha256: predecessor.entry.capture.sha256,
        }
      : null,
    successor: {
      manifestSha256: candidate.entry.manifestSha256,
      snapshotSha256: candidate.entry.capture.sha256,
    },
    reviewer: 'test reviewer',
    reviewedAt: '2026-10-24T00:01:00Z',
    reason: 'Synthetic source order review',
  };
}
