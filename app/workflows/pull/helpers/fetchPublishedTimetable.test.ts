import { afterEach, expect, it, vi } from 'vitest';
import { fetchPublishedTimetable } from './fetchPublishedTimetable';

const index = {
  manifestSha256: 'a'.repeat(64),
  releaseSha256: 'b'.repeat(64),
};
const sourceReview = {
  schemaVersion: 1,
  documentKind: 'scheduled-timetable-source-review',
  decision: 'baseline',
  predecessor: null,
  successor: {
    manifestSha256: index.manifestSha256,
    snapshotSha256: 'c'.repeat(64),
  },
  reviewer: 'Published source reviewer',
  reviewedAt: '2026-11-28T00:00:00Z',
  reason: 'Exact approved source',
};

function publish(
  publishedIndex: unknown = index,
  receipt: unknown = { combinedReleaseIndex: index, sourceReview },
) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const value = url.endsWith('/combined-timetable-publication.json')
        ? receipt
        : publishedIndex;
      return value === null
        ? new Response(null, { status: 404 })
        : Response.json(value);
    }),
  );
}

afterEach(() => vi.unstubAllGlobals());

it('discovers the current release and its source review outside the archive', async () => {
  publish();
  expect(await fetchPublishedTimetable('https://data.example.com', {})).toEqual(
    {
      combinedReleaseIndex: index,
      sourceReview,
    },
  );
});

it('replays the already published legacy index without a public review', async () => {
  publish(index, null);
  expect(await fetchPublishedTimetable('https://data.example.com', {})).toEqual(
    {
      combinedReleaseIndex: index,
      sourceReview: undefined,
    },
  );
});

it('rejects mismatched public receipts and stale signed requests', async () => {
  publish(index, {
    combinedReleaseIndex: { ...index, releaseSha256: 'd'.repeat(64) },
    sourceReview,
  });
  await expect(
    fetchPublishedTimetable('https://data.example.com', {}),
  ).rejects.toThrow('differs from the release index');
  publish(index, {
    combinedReleaseIndex: index,
    sourceReview: {
      ...sourceReview,
      successor: { ...sourceReview.successor, manifestSha256: 'd'.repeat(64) },
    },
  });
  await expect(
    fetchPublishedTimetable('https://data.example.com', {}),
  ).rejects.toThrow('does not bind the release index');
  publish();
  await expect(
    fetchPublishedTimetable('https://data.example.com', {
      combinedReleaseIndex: { ...index, manifestSha256: 'd'.repeat(64) },
    }),
  ).rejects.toThrow('differs from the published release');
});

it('keeps canonical-only sources and rejects missing public indexes', async () => {
  publish(null, null);
  expect(await fetchPublishedTimetable('https://data.example.com', {})).toEqual(
    {
      combinedReleaseIndex: undefined,
      sourceReview: undefined,
    },
  );
  await expect(
    fetchPublishedTimetable('https://data.example.com', {
      combinedReleaseIndex: index,
    }),
  ).rejects.toThrow('differs from the published release');
});
