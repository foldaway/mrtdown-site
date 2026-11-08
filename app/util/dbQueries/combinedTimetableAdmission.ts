import {
  ScheduledTimetableArtifactManifestSchema,
  ScheduledTimetableArtifactMetadataSchema,
} from '@mrtdown/core';
import {
  CombinedTimetableReleaseIndexSchema,
  hashBytes,
  verifyCombinedTimetableReleaseBundle,
} from '@mrtdown/fs';
import { z } from 'zod';

type VerifyBundle = typeof verifyCombinedTimetableReleaseBundle;
type BundleFiles = Parameters<VerifyBundle>[1];
type Topology = Parameters<VerifyBundle>[2];
type ReleaseIndex = z.infer<typeof CombinedTimetableReleaseIndexSchema>;

const manifestShape = ScheduledTimetableArtifactManifestSchema.shape;
const combinedManifest = z.object({
  schemaVersion: manifestShape.schemaVersion,
  documentKind: z.literal('gtfs-combined-timetable-release-manifest'),
  correctionRevision: manifestShape.correctionRevision,
  capture: manifestShape.capture,
  currentLicenceReference: manifestShape.currentLicenceReference,
  mrtdownLicence: manifestShape.mrtdownLicence,
  identity: z.object({ source: manifestShape.identity }),
  reviewDraftSha256: manifestShape.mapping.shape.draftSha256,
  assignmentsSha256: manifestShape.mapping.shape.assignmentsSha256,
  timetable: manifestShape.timetable,
});

const combinedReleaseMetadata = z.strictObject({
  index: CombinedTimetableReleaseIndexSchema,
  sourceFeedInfo: ScheduledTimetableArtifactMetadataSchema.shape.sourceFeedInfo,
  releaseByteLength: z.number().int().positive(),
});

export function prepareCombinedTimetableAdmission(
  index: ReleaseIndex,
  input: BundleFiles,
  topology: Topology,
) {
  const files = {
    manifestBytes: Buffer.from(input.manifestBytes),
    timetableBytes: Buffer.from(input.timetableBytes),
    releaseBytes: Buffer.from(input.releaseBytes),
  };
  const verified = verifyCombinedTimetableReleaseBundle(index, files, topology);
  const metadata = combinedReleaseMetadata.parse({
    index: verified.index,
    sourceFeedInfo: verified.artifact.sourceFeedInfo,
    releaseByteLength: files.releaseBytes.byteLength,
  });
  return {
    hash: verified.index.manifestSha256,
    manifest: readCombinedTimetableAdmissionManifest(
      verified.index.manifestSha256,
      files.manifestBytes,
      metadata,
    ),
    files: {
      pages_entry: null,
      combined_release: metadata,
      manifest_bytes: files.manifestBytes,
      timetable_bytes: files.timetableBytes,
      release_bytes: files.releaseBytes,
    },
  };
}

/** Read admission metadata only from the retained row. The feed info was
 * extracted from the hash-verified compact timetable during retention. */
export function readCombinedTimetableAdmissionManifest(
  hash: string,
  manifestBytes: Buffer,
  releaseMetadata: unknown,
) {
  const { index, sourceFeedInfo, releaseByteLength } =
    combinedReleaseMetadata.parse(releaseMetadata);
  if (hash !== index.manifestSha256 || hashBytes(manifestBytes) !== hash) {
    throw new Error(
      'Retained combined release disagrees with manifest identity',
    );
  }
  const release = combinedManifest.parse(
    JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(manifestBytes)),
  );
  const [feedInfo] = sourceFeedInfo;
  function providerDate(value: string | undefined) {
    if (!value || !/^\d{8}$/.test(value)) {
      throw new Error(
        'Combined timetable requires declared source feed bounds',
      );
    }
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6)}`;
  }
  // The shared source-order assessor accepts the legacy manifest shape. Its
  // source checks use capture, correction, source manifest and provider feed
  // fields. The other identities below describe the real combined release files.
  return ScheduledTimetableArtifactManifestSchema.parse({
    schemaVersion: release.schemaVersion,
    documentKind: 'scheduled-timetable-artifact',
    correctionRevision: release.correctionRevision,
    capture: release.capture,
    currentLicenceReference: release.currentLicenceReference,
    mrtdownLicence: release.mrtdownLicence,
    identity: release.identity.source,
    sourceFeedInfo,
    feedRange: {
      startDate: providerDate(feedInfo?.feed_start_date),
      endDate: providerDate(feedInfo?.feed_end_date),
    },
    mapping: {
      version: release.documentKind,
      draftSha256: release.reviewDraftSha256,
      assignmentsSha256: release.assignmentsSha256,
    },
    timetable: release.timetable,
    notice: { sha256: index.releaseSha256, byteLength: releaseByteLength },
  });
}
