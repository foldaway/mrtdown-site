import { createFileRoute } from '@tanstack/react-router';
import { getDb } from '~/db';
import { purgePublicDataCache } from '~/util/cloudflareCache';
import { triggerCrowdReportDispatchAfterSubmission } from '~/util/crowdReportDispatch';
import {
  CrowdReportIdempotencyConflictError,
  findMissingCrowdReportReferences,
  findProgrammaticCrowdReportRetry,
  parseCrowdReportJsonBody,
  persistAutomoderatedProgrammaticCrowdReport,
  validateStructuredCrowdReportSubmission,
} from '~/util/crowdReports';
import {
  authenticateCrowdReportProducer,
  hashProgrammaticCrowdReportPayload,
  isProgrammaticCrowdReportSourceAllowed,
  ProgrammaticCrowdReportRequestSchema,
} from '~/util/programmaticCrowdReports';

type ProgrammaticCrowdReportEnvironment = Record<string, string | undefined> & {
  CLOUDFLARE_CACHE_PURGE_TOKEN?: string;
  CLOUDFLARE_ZONE_ID?: string;
  CROWD_REPORT_PRODUCERS?: string;
  TIER?: string;
};

const defaultDependencies = {
  getDb,
  purgePublicDataCache,
  triggerCrowdReportDispatchAfterSubmission,
  findMissingCrowdReportReferences,
  findProgrammaticCrowdReportRetry,
  persistAutomoderatedProgrammaticCrowdReport,
};

type ProgrammaticCrowdReportDependencies = typeof defaultDependencies;

export async function handleProgrammaticCrowdReportPost(
  request: Request,
  environment: ProgrammaticCrowdReportEnvironment = process.env,
  dependencies: ProgrammaticCrowdReportDependencies = defaultDependencies,
) {
  const authentication = await authenticateCrowdReportProducer(
    request,
    environment.CROWD_REPORT_PRODUCERS,
  );
  if (!authentication.success) {
    return Response.json(
      { success: false, error: authentication.error },
      { status: authentication.status },
    );
  }

  const parsedBody = await parseCrowdReportJsonBody(request);
  if (!parsedBody.success) {
    return Response.json(
      { success: false, error: parsedBody.error },
      { status: parsedBody.status },
    );
  }

  const parsedRequest = ProgrammaticCrowdReportRequestSchema.safeParse(
    parsedBody.body,
  );
  if (!parsedRequest.success) {
    return Response.json(
      {
        success: false,
        error: 'Invalid programmatic crowd report',
        issues: parsedRequest.error.issues.map((issue) => issue.message),
      },
      { status: 400 },
    );
  }

  if (
    !isProgrammaticCrowdReportSourceAllowed(
      authentication.producer,
      parsedRequest.data.sourceUrl,
    )
  ) {
    return Response.json(
      {
        success: false,
        error: 'sourceUrl origin is not allowed for this producer',
      },
      { status: 400 },
    );
  }

  const delivery = {
    producer: authentication.producer.id,
    externalReportId: parsedRequest.data.externalReportId,
    sourceUrl: parsedRequest.data.sourceUrl,
    requestPayloadDigest: await hashProgrammaticCrowdReportPayload(
      parsedRequest.data,
    ),
  };
  const db = dependencies.getDb();

  try {
    const retry = await dependencies.findProgrammaticCrowdReportRetry(
      db,
      delivery,
    );
    if (retry != null) {
      return programmaticCrowdReportResponse(retry);
    }
  } catch (error) {
    if (error instanceof CrowdReportIdempotencyConflictError) {
      return idempotencyConflictResponse(error.reportId);
    }
    throw error;
  }

  const validation = validateStructuredCrowdReportSubmission(
    parsedRequest.data.report,
  );
  if (!validation.success) {
    return Response.json(
      {
        success: false,
        error: 'Invalid report',
        issues: validation.issues,
      },
      { status: 400 },
    );
  }

  const missingReferences = await dependencies.findMissingCrowdReportReferences(
    db,
    validation.data,
  );
  if (
    missingReferences.lineIds.length > 0 ||
    missingReferences.stationIds.length > 0 ||
    missingReferences.directionStationIds.length > 0
  ) {
    return Response.json(
      {
        success: false,
        error: 'Invalid affected line or station',
        missingReferences,
      },
      { status: 400 },
    );
  }

  try {
    const result =
      await dependencies.persistAutomoderatedProgrammaticCrowdReport(
        db,
        validation.data,
        delivery,
      );

    if (result.created) {
      dependencies.triggerCrowdReportDispatchAfterSubmission(db, environment);
      try {
        await dependencies.purgePublicDataCache({ env: environment });
      } catch (error) {
        console.error(
          'Failed to purge public cache after programmatic crowd report submission',
          { error },
        );
      }
    }

    return programmaticCrowdReportResponse(result);
  } catch (error) {
    if (error instanceof CrowdReportIdempotencyConflictError) {
      return idempotencyConflictResponse(error.reportId);
    }

    console.error('Programmatic crowd report submission failed', { error });
    return Response.json(
      { success: false, error: 'Report submission failed' },
      { status: 500 },
    );
  }
}

function programmaticCrowdReportResponse(result: {
  id: string;
  status: string;
  duplicateOfId: string | null;
  created: boolean;
}) {
  return Response.json(
    {
      success: true,
      data: {
        id: result.id,
        status: result.status,
        duplicateOfId: result.duplicateOfId,
        idempotentReplay: !result.created,
      },
    },
    { status: 202 },
  );
}

function idempotencyConflictResponse(reportId: string) {
  return Response.json(
    {
      success: false,
      error: 'externalReportId was already used with a different payload',
      reportId,
    },
    { status: 409 },
  );
}

export const Route = createFileRoute('/internal/api/crowd-reports')({
  server: {
    handlers: {
      POST: ({ request }) => handleProgrammaticCrowdReportPost(request),
    },
  },
});
