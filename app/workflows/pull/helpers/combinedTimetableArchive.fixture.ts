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
  const { services, lines, stations } = canonical.canonical;
  const path = services[0].revisions[0].path.stations;
  path.splice(1, 0, { ...path[0] }, { ...path[0] });
  services.push({
    ...services[0],
    id: 'service-shared',
    revisions: [{ ...services[0].revisions[0], id: 'shared-revision' }],
  });
  const platforms = stations[0].layout?.platforms;
  if (!platforms?.length) throw new Error('Missing fixture platforms');
  const basePlatform = { ...platforms[0] };
  platforms[0].serviceIds = ['service'];
  platforms.push(
    { ...basePlatform, id: 'platform-shared', serviceIds: ['service-shared'] },
    { ...basePlatform, id: 'platform-common' },
    {
      ...basePlatform,
      id: 'platform-closed',
      boardingStatus: 'not_in_service',
    },
  );
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
  const serviceMemberships = services.map(({ id, revisions }) => ({
    serviceId: id,
    revisionId: revisions[0].id,
  }));
  const stationCalls = [
    {
      stationId: 'station-1',
      platformIds: ['platform-1', 'platform-shared', 'platform-closed'],
    },
    { stationId: 'station-1', platformIds: ['platform-common'] },
    { stationId: 'station-1', platformIds: ['platform-common'] },
    { stationId: 'station-2', platformIds: ['platform-2'] },
  ];
  const sequences = [
    '9007199254740993',
    '09007199254740994',
    '9007199254740995',
    '9007199254740996',
  ];
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
    calls: stationCalls.map(({ stationId, platformIds }, index) => ({
      stationId,
      platformSemantics:
        index === 0
          ? 'distinct-platform-associations'
          : 'complete-source-alternatives',
      platforms: platformIds.map((platformId) => {
        const platform = topology.stations
          .find(({ id }) => id === stationId)
          ?.platforms.find(({ id }) => id === platformId);
        if (!platform) throw new Error('Missing fixture call platform');
        return {
          platformId,
          boardingStatus: platform.boardingStatus ?? null,
          accessByService: serviceMemberships.map((member) => {
            const serviceScope = !platform.serviceIds.length
              ? 'unspecified'
              : platform.serviceIds.includes(member.serviceId)
                ? 'listed'
                : 'excluded';
            const canAccess =
              serviceScope !== 'excluded' && !platform.boardingStatus;
            return {
              ...member,
              serviceScope,
              passengerBoardingEligible:
                canAccess && index < stationCalls.length - 1,
              passengerAlightingEligible: canAccess,
            };
          }),
        };
      }),
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
        stopTimes: [90_000, 90_000, null, 90_060].map((seconds, index) => ({
          providerTripId: 'trip',
          providerStopId: index === 3 ? 'stop-2' : 'stop-1',
          stopSequence: sequences[index],
          arrivalSeconds: seconds,
          departureSeconds: seconds,
          pickupType: 0,
          dropOffType: 0,
          timepoint: index === 0 || index === 3 ? 1 : 0,
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
    canonical,
    sequences,
    topology,
    capture,
    snapshot,
    files: { manifestBytes, timetableBytes, releaseBytes },
  };
}
