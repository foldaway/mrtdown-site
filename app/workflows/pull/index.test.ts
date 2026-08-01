import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('pull workflow promotion order', () => {
  it('keeps promotion, orphan deletion, finalization, and fact rebuild steps in dependency order', () => {
    const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
    const orderedStepNames = [
      'sync-operators-towns-landmarks-upserts',
      'sync-lines',
      'sync-stations',
      'sync-services',
      'sync-station-platform-services',
      'sync-issues-changed-',
      'sync-issues-orphans-',
      'delete-service-orphans',
      'delete-station-orphans',
      'delete-line-orphans',
      'delete-operators-towns-landmarks-orphans',
      'finalize',
      'rebuild-operational-facts',
      'rebuild-statistics-snapshot',
      'rebuild-sitemap-snapshot',
      'publish-public-data-cache',
      'record-manifest-fingerprint',
    ];

    let previousIndex = -1;
    for (const stepName of orderedStepNames) {
      const index = source.indexOf(stepName, previousIndex + 1);
      expect(index, `${stepName} is present`).toBeGreaterThanOrEqual(0);
      expect(index, `${stepName} is after previous step`).toBeGreaterThan(
        previousIndex,
      );
      previousIndex = index;
    }
  });

  it('checks the canonical manifest before parsing and records it only after publication', () => {
    const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

    const checkIndex = source.indexOf('check-manifest-fingerprint');
    const parseIndex = source.indexOf("'parse'");
    const publishIndex = source.indexOf('publish-public-data-cache');
    const recordIndex = source.indexOf('record-manifest-fingerprint');

    expect(checkIndex).toBeGreaterThanOrEqual(0);
    expect(checkIndex).toBeLessThan(parseIndex);
    expect(recordIndex).toBeGreaterThan(publishIndex);
  });
});
