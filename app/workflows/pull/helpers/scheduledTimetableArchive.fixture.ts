import {
  ScheduledAssignedTimetableSchema,
  ScheduledTimetableArtifactManifestSchema,
  ScheduledTimetableArtifactMetadataSchema,
  type ScheduledTripPattern,
} from '@mrtdown/core';
import {
  GtfsTimetableReleaseReviewSchema,
  gtfsTimetableMappingApprovalSha256,
  hashBytes,
  prepareScheduledTimetableArtifact,
  ScopedReconciliationApprovalSchema,
  ScopedReconciliationDraftSchema,
  type scheduleTopologyProjection,
  scopedReviewDraftSha256,
} from '@mrtdown/fs';
import { retentionBundle } from '~/util/dbQueries/scheduledTimetableRetention.fixture';

const encode = (value: unknown) =>
  Buffer.from(`${JSON.stringify(value, null, 2)}\n`);

// Extend the single-trip storage fixture with synthetic bound review records.
// Optional allocation exercises canonical checks; these are not real reviews.
export function scheduledTimetableArchiveFixture(
  source = 'a',
  allocation?: {
    topology: ReturnType<typeof scheduleTopologyProjection>;
    pattern: ScheduledTripPattern;
  },
) {
  const bundle = retentionBundle(source);
  if (allocation) {
    const original = ScheduledTimetableArtifactManifestSchema.parse(
      JSON.parse(new TextDecoder().decode(bundle.files['manifest.json'])),
    );
    const timetable = ScheduledAssignedTimetableSchema.parse(
      JSON.parse(new TextDecoder().decode(bundle.files['timetable.json'])),
    );
    const artifact = prepareScheduledTimetableArtifact(
      {
        ...timetable,
        patterns: [{ id: 'pattern', pattern: allocation.pattern }],
        assignments: [
          {
            providerTripId: 'trip',
            patternId: 'pattern',
            dateRanges: [original.feedRange],
          },
        ],
      },
      {
        ...ScheduledTimetableArtifactMetadataSchema.strip().parse(original),
        identity: {
          ...original.identity,
          topology: {
            projectionVersion: 1,
            sha256: hashBytes(Buffer.from(JSON.stringify(allocation.topology))),
          },
        },
      },
    );
    bundle.files['manifest.json'] = artifact.manifestBytes;
    bundle.files['timetable.json'] = artifact.timetableBytes;
    bundle.files['NOTICE.txt'] = artifact.noticeBytes;
    bundle.entry.coverage.assignedTripDateCount = 1;
    bundle.entry.coverage.missingTripDateCount = 0;
  }
  const manifest = ScheduledTimetableArtifactManifestSchema.parse(
    JSON.parse(new TextDecoder().decode(bundle.files['manifest.json'])),
  );
  const draft = ScopedReconciliationDraftSchema.parse({
    schemaVersion: 2,
    documentKind: 'gtfs-scoped-mapping-draft',
    identity: manifest.identity,
    preparedBy: 'Synthetic preparer',
    pilotLineIds: ['test'],
    dateSets: [],
    decisions: [],
  });
  manifest.mapping.draftSha256 = scopedReviewDraftSha256(draft);
  bundle.files['manifest.json'] = encode(manifest);
  bundle.entry.manifestSha256 = hashBytes(bundle.files['manifest.json']);
  const approval = ScopedReconciliationApprovalSchema.parse({
    schemaVersion: 2,
    documentKind: 'gtfs-scoped-mapping-approval',
    identity: manifest.identity,
    draftSha256: manifest.mapping.draftSha256,
    reviewer: 'Synthetic reviewer',
    reason: 'Synthetic mapping binding only',
  });
  // Sorted keys make this fixture's compact JSON the shared review fingerprint.
  const review = {
    captureConditions: 'Synthetic source',
    decision: 'release-permitted',
    documentKind: 'gtfs-timetable-release-review',
    effectiveAt: null,
    licenceVersion: 'test',
    manifestSha256: bundle.entry.manifestSha256,
    mappingApprovalSha256: gtfsTimetableMappingApprovalSha256(approval),
    obligations: 'Synthetic obligations',
    reviewedAt: '2026-10-24T00:01:00Z',
    reviewer: 'Synthetic reviewer',
    schemaVersion: 1,
    terms: {
      apiTerms: {
        reference:
          'https://datamall.lta.gov.sg/content/datamall/en/api-terms-of-service.html',
        sha256: 'e'.repeat(64),
      },
      licence: {
        reference: manifest.currentLicenceReference,
        sha256: 'f'.repeat(64),
      },
    },
  };
  GtfsTimetableReleaseReviewSchema.parse(review);
  bundle.files['mapping-draft.json'] = encode(draft);
  bundle.files['mapping-approval.json'] = encode(approval);
  bundle.files['release-review.json'] = encode(review);
  bundle.files['release.json'] = encode({
    schemaVersion: 1,
    documentKind: 'gtfs-timetable-release',
    manifestSha256: bundle.entry.manifestSha256,
    release: {
      eligible: true,
      blockers: [],
      mappingApprovalSha256: review.mappingApprovalSha256,
      reviewSha256: hashBytes(Buffer.from(JSON.stringify(review))),
      releaseInstant: '2026-10-24T00:02:00Z',
    },
    review: { mappingReviewEligible: true },
    coverage: bundle.entry.coverage,
    currentTerms: review.terms,
  });
  bundle.entry.releaseSha256 = hashBytes(bundle.files['release.json']);
  return bundle;
}
