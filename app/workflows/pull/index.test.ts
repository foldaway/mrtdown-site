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
      'sync-issues-changed-',
      'sync-issues-orphans-',
      'delete-service-orphans',
      'delete-station-orphans',
      'delete-line-orphans',
      'delete-operators-towns-landmarks-orphans',
      'finalize',
      'rebuild-operational-facts',
      'rebuild-statistics-snapshot',
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

  it('uses larger issue promotion batches for paid-tier D1 subrequest limits', () => {
    const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

    expect(source).toContain('const ISSUE_SYNC_BATCH_SIZE = 50;');
  });

  it('raises Worker subrequest limits for larger issue promotion batches', () => {
    const source = readFileSync(
      new URL('../../../wrangler.jsonc', import.meta.url),
      'utf8',
    );

    expect(source).toContain('"subrequests": 20000');
  });
});
