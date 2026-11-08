import { hashBytes } from '@mrtdown/fs';
import { retentionBundle } from '~/util/dbQueries/scheduledTimetableRetention.fixture';
import { scheduledTimetableCanonicalFixture } from './scheduledTimetableCanonical.fixture';

const digest = 'd'.repeat(64);

function json(value: unknown) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
}

function sortedJson(value: unknown): string {
  return JSON.stringify(value, (_key, item) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(
          Object.keys(item)
            .sort()
            .map((key) => [key, item[key]]),
        )
      : item,
  );
}

/** Synthetic wire-format bundle for importer tests. Every digest binds exact fixture bytes. */
export function combinedTimetableArchiveFixture() {
  const canonical = scheduledTimetableCanonicalFixture();
  const { services, lines } = canonical.canonical;
  services.push({ ...services[0], id: 'service-shared' });
  lines[0].serviceIds.push('service-shared');
  const topology = canonical.topology();
  const snapshot = canonical.archive();
  const capture = {
    ...retentionBundle('e').entry.capture,
    retrieved_at: '2026-11-02T00:00:00Z',
  };
  const source = {
    canonicalCommit: 'a'.repeat(40),
    sourceManifest: { 'stop_times.txt': digest },
    topology: {
      projectionVersion: 1,
      sha256: hashBytes(Buffer.from(JSON.stringify(topology))),
    },
  };
  const identity = {
    source,
    captureSha256: capture.sha256,
    policySha256: digest,
    allocationPolicySha256: digest,
    holidayPolicySha256: digest,
    reviewTopologySha256: digest,
    supportedDatePopulationSha256: digest,
    applicabilityPolicySha256: digest,
    sourceJourneyPolicySha256: digest,
    sharedServiceMembershipsSha256: digest,
    datePopulationSha256: digest,
  };
  const mappingApproval = {
    schemaVersion: 1,
    documentKind: 'gtfs-combined-mapping-approval',
    identity,
    draftSha256: digest,
    reviewer: 'Synthetic mapping reviewer',
    reason: 'Test approval for both services',
  };
  const mappingApprovalSha256 = hashBytes(
    Buffer.from(sortedJson(mappingApproval)),
  );
  const serviceDateRange = {
    startDate: '2026-11-29',
    endDateExclusive: '2026-12-01',
  };
  const serviceMemberships = services.map(({ id }) => ({
    serviceId: id,
    revisionId: 'revision',
  }));
  const pattern = {
    providerPatternId: digest,
    lineId: 'line',
    serviceMemberships,
    destinationStationId: 'station-2',
    pathBasis: 'canonical-ordered-path',
    routeMapping: {
      providerRouteId: 'route',
      lineId: 'line',
      providerAgencyId: 'agency',
      operatorId: 'operator',
    },
    calls: [1, 2].map((stop) => ({
      stationId: `station-${stop}`,
      platformSemantics: 'complete-source-alternatives',
      platforms: [
        {
          platformId: `platform-${stop}`,
          boardingStatus: null,
          accessByService: serviceMemberships.map((member) => ({
            ...member,
            serviceScope: 'unspecified',
            passengerBoardingEligible: stop === 1,
            passengerAlightingEligible: stop === 2,
          })),
        },
      ],
    })),
  };
  const patternId = hashBytes(Buffer.from(JSON.stringify(pattern)));
  const serviceDates = ['2026-11-30'];
  const dateSetId = hashBytes(Buffer.from(JSON.stringify(serviceDates)));
  const provenance = {
    schemaVersion: 1,
    capture,
    identity,
    reviewDraftSha256: mappingApproval.draftSha256,
    mappingApprovalSha256,
    assignmentsSha256: digest,
  };
  const timetableBytes = json({
    ...provenance,
    documentKind: 'gtfs-combined-timetable-artifact',
    sourceFeedInfo: [
      {
        feed_version: 'combined-fixture',
        feed_start_date: '20261101',
        feed_end_date: '20261231',
      },
    ],
    applicabilityPolicy: {
      schemaVersion: 1,
      revision: 'synthetic-dates',
      captureSha256: capture.sha256,
      sourceManifest: source.sourceManifest,
      dateBasis: 'service-date',
      timezone: 'Asia/Singapore',
      serviceDateRange,
      basis: 'Synthetic holiday-adjusted service dates',
    },
    trips: [
      {
        providerTripId: 'trip',
        providerRouteId: 'route',
        providerCalendarId: 'calendar',
        stopTimes: [1, 2].map((stop) => ({
          providerTripId: 'trip',
          providerStopId: `stop-${stop}`,
          stopSequence: String(9007199254740992n + BigInt(stop)),
          arrivalSeconds: 90_000 + (stop - 1) * 60,
          departureSeconds: 90_000 + (stop - 1) * 60,
          pickupType: 0,
          dropOffType: 0,
          timepoint: 1,
        })),
      },
    ],
    patterns: { [patternId]: pattern },
    dateSets: { [dateSetId]: serviceDates },
    assignments: [{ providerTripId: 'trip', patternId, dateSetId }],
    coverage: {
      sourceTripCount: 1,
      assignedTripCount: 1,
      literalTripDateCount: 2,
      effectiveTripDateCount: 2,
      supportedTripDateCount: 1,
      outsideTripDateCount: 1,
      assignedTripDateCount: 1,
      unassignedTripDateCount: 0,
      excludedTripDateCount: 0,
      tripDateCoverageComplete: true,
      gaps: [],
    },
    generationEligible: false,
  });
  const manifestBytes = json({
    ...provenance,
    documentKind: 'gtfs-combined-timetable-release-manifest',
    correctionRevision: 1,
    currentLicenceReference: capture.licence_reference,
    mrtdownLicence: 'CC-BY-4.0',
    serviceDateRange,
    timetable: {
      sha256: hashBytes(timetableBytes),
      byteLength: timetableBytes.byteLength,
    },
  });
  const manifestSha256 = hashBytes(manifestBytes);
  const currentTerms = {
    licence: { reference: capture.licence_reference, sha256: digest },
    apiTerms: {
      reference:
        'https://datamall.lta.gov.sg/content/datamall/en/api-terms-of-service.html',
      sha256: digest,
    },
  };
  const releaseBytes = json({
    schemaVersion: 1,
    documentKind: 'gtfs-combined-timetable-release-evidence',
    releaseInstant: '2026-11-03T00:00:00Z',
    mappingApproval,
    currentTerms,
    releaseReview: {
      schemaVersion: 1,
      documentKind: 'gtfs-timetable-release-review',
      manifestSha256,
      mappingApprovalSha256,
      reviewer: 'Synthetic release reviewer',
      reviewedAt: '2026-11-02T01:00:00Z',
      decision: 'release-permitted',
      terms: currentTerms,
      licenceVersion: 'synthetic',
      obligations: 'Fixture attribution',
      captureConditions: 'Synthetic capture',
      effectiveAt: null,
    },
  });
  const index = { manifestSha256, releaseSha256: hashBytes(releaseBytes) };
  return {
    index,
    topology,
    capture,
    snapshot,
    files: { manifestBytes, timetableBytes, releaseBytes },
  };
}
