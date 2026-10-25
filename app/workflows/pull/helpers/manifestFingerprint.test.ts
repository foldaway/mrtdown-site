import type { Manifest } from '@mrtdown/core';
import { describe, expect, it } from 'vitest';
import { getCanonicalManifestFingerprint } from './manifestFingerprint';
import { scheduledTimetableArchiveFixture } from './scheduledTimetableArchive.fixture';

function createManifest(overrides: Partial<Manifest> = {}): Manifest {
  return {
    manifestVersion: 2,
    generatedAt: '2026-08-01T00:00:00.000Z',
    lines: { NSL: 'line-hash' },
    stations: { NS1: 'station-hash' },
    towns: { woodland: 'town-hash' },
    landmarks: { landmark: 'landmark-hash' },
    operators: { smrt: 'operator-hash' },
    services: { 'NSL-1': 'service-hash' },
    issues: { '2026-08-example': 'issue-hash' },
    rights: { licenseData: 'license-hash', sourceRegistry: 'registry-hash' },
    ...overrides,
  };
}

describe('getCanonicalManifestFingerprint', () => {
  it('ignores publication time and record key order', () => {
    const original = createManifest({
      lines: { NSL: 'line-hash', EWL: 'east-west-hash' },
    });
    const republished = createManifest({
      generatedAt: '2026-08-02T00:00:00.000Z',
      lines: { EWL: 'east-west-hash', NSL: 'line-hash' },
    });

    expect(getCanonicalManifestFingerprint(republished)).toBe(
      getCanonicalManifestFingerprint(original),
    );
  });

  it('changes when a read-model input changes', () => {
    const original = createManifest();
    const changed = createManifest({
      services: { 'NSL-1': 'changed-service-hash' },
    });

    expect(getCanonicalManifestFingerprint(changed)).not.toBe(
      getCanonicalManifestFingerprint(original),
    );
  });

  it('detects timetable-only additions, replacements, release changes and removal', () => {
    const entry = scheduledTimetableArchiveFixture().entry;
    const manifests = [
      createManifest(),
      createManifest({ scheduledTimetable: entry }),
      createManifest({
        scheduledTimetable: scheduledTimetableArchiveFixture('b').entry,
      }),
      createManifest({
        scheduledTimetable: { ...entry, releaseSha256: 'e'.repeat(64) },
      }),
    ];
    expect(new Set(manifests.map(getCanonicalManifestFingerprint)).size).toBe(
      4,
    );
    expect(getCanonicalManifestFingerprint(createManifest())).toBe(
      getCanonicalManifestFingerprint(manifests[0]),
    );
    const reordered = Object.fromEntries(Object.entries(entry).reverse());
    expect(
      getCanonicalManifestFingerprint(
        createManifest({ scheduledTimetable: reordered as typeof entry }),
      ),
    ).toBe(getCanonicalManifestFingerprint(manifests[1]));
  });
});
