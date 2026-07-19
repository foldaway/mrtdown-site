import { describe, expect, it, vi } from 'vitest';
import { ReferenceCatalogUnavailableError } from '~/util/referenceCatalog';
import { handleReferenceCatalogGet } from './internal.api.reference-catalog.v1';

const ENVIRONMENT = {
  CROWD_REPORT_PRODUCERS: '{"reddit-monitor":{"token":"secret"}}',
};

function makeRequest() {
  return new Request('https://example.com/internal/api/reference-catalog/v1', {
    headers: { authorization: 'Bearer reddit-monitor-secret' },
  });
}

function makeDependencies() {
  const db = {};
  return {
    db,
    authenticateProducer: vi.fn().mockResolvedValue({
      success: true,
      producer: { id: 'reddit-monitor', sourceOrigins: [] },
    }),
    getDb: vi.fn(() => db),
    getReferenceCatalog: vi.fn().mockResolvedValue({
      schemaVersion: 1,
      datasetVersion: '2026-07-19T00:00:00.000Z',
      referenceDate: '2026-07-19',
      lines: [],
      stations: [],
      memberships: [],
    }),
  };
}

describe('GET /internal/api/reference-catalog/v1', () => {
  it('authenticates before accessing the database', async () => {
    const dependencies = makeDependencies();
    dependencies.authenticateProducer.mockResolvedValue({
      success: false,
      status: 401,
      error: 'Unauthorized',
    });

    const response = await handleReferenceCatalogGet(
      makeRequest(),
      ENVIRONMENT,
      dependencies as never,
    );

    expect(response.status).toBe(401);
    expect(dependencies.getDb).not.toHaveBeenCalled();
    expect(dependencies.getReferenceCatalog).not.toHaveBeenCalled();
  });

  it('returns the versioned catalog with a bounded private cache policy', async () => {
    const dependencies = makeDependencies();
    const response = await handleReferenceCatalogGet(
      makeRequest(),
      ENVIRONMENT,
      dependencies as never,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, max-age=300');
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: {
        schemaVersion: 1,
        datasetVersion: '2026-07-19T00:00:00.000Z',
      },
    });
    expect(dependencies.getReferenceCatalog).toHaveBeenCalledWith(
      dependencies.db,
    );
  });

  it('returns a retryable response when no completed dataset is available', async () => {
    const dependencies = makeDependencies();
    dependencies.getReferenceCatalog.mockRejectedValue(
      new ReferenceCatalogUnavailableError('Dataset version is unavailable'),
    );

    const response = await handleReferenceCatalogGet(
      makeRequest(),
      ENVIRONMENT,
      dependencies as never,
    );

    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'Reference catalog is unavailable',
    });
  });
});
