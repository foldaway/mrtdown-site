import { createFileRoute } from '@tanstack/react-router';
import { getDb } from '~/db';
import {
  authenticateCrowdReportProducer,
  type CrowdReportProducerAuthenticationResult,
} from '~/util/programmaticCrowdReports';
import {
  getReferenceCatalog,
  ReferenceCatalogUnavailableError,
} from '~/util/referenceCatalog';

type ReferenceCatalogEnvironment = Record<string, string | undefined> & {
  CROWD_REPORT_PRODUCERS?: string;
};

const defaultDependencies = {
  authenticateProducer: authenticateCrowdReportProducer,
  getDb,
  getReferenceCatalog,
};

type ReferenceCatalogDependencies = typeof defaultDependencies;

export async function handleReferenceCatalogGet(
  request: Request,
  environment: ReferenceCatalogEnvironment = process.env,
  dependencies: ReferenceCatalogDependencies = defaultDependencies,
) {
  const authentication: CrowdReportProducerAuthenticationResult =
    await dependencies.authenticateProducer(
      request,
      environment.CROWD_REPORT_PRODUCERS,
    );
  if (!authentication.success) {
    return Response.json(
      { success: false, error: authentication.error },
      { status: authentication.status },
    );
  }

  try {
    const catalog = await dependencies.getReferenceCatalog(
      dependencies.getDb(),
    );
    return Response.json(
      { success: true, data: catalog },
      {
        status: 200,
        headers: { 'cache-control': 'private, max-age=300' },
      },
    );
  } catch (error) {
    if (error instanceof ReferenceCatalogUnavailableError) {
      return Response.json(
        { success: false, error: 'Reference catalog is unavailable' },
        { status: 503, headers: { 'cache-control': 'no-store' } },
      );
    }

    console.error('Reference catalog request failed', { error });
    return Response.json(
      { success: false, error: 'Reference catalog request failed' },
      { status: 500, headers: { 'cache-control': 'no-store' } },
    );
  }
}

export const Route = createFileRoute('/internal/api/reference-catalog/v1')({
  server: {
    handlers: {
      GET: ({ request }) => handleReferenceCatalogGet(request),
    },
  },
});
