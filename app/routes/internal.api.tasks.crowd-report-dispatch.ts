import { env } from 'cloudflare:workers';
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { getDb } from '~/db';
import {
  dispatchPendingCrowdReports,
  getDispatchableCrowdReportCandidates,
} from '~/util/crowdReportDispatch';
import { internalMiddleware } from '~/util/internal.middleware';

type CrowdReportDispatchRuntimeEnv = typeof env & {
  CROWD_REPORT_DISPATCH_GITHUB_TOKEN?: string;
  CROWD_REPORT_DISPATCH_GITHUB_OWNER?: string;
  CROWD_REPORT_DISPATCH_GITHUB_REPO?: string;
  CROWD_REPORT_DISPATCH_GITHUB_EVENT_TYPE?: string;
};

const RequestSchema = z
  .object({
    dryRun: z.boolean().default(false),
    kind: z.enum(['any', 'cluster', 'report']).default('any'),
    limit: z.number().int().min(1).max(50).default(10),
  })
  .strict();

async function parseOptionalJsonBody(request: Request) {
  if (request.headers.get('content-length') === '0') {
    return {};
  }

  try {
    const text = await request.text();
    return text.trim().length === 0 ? {} : JSON.parse(text);
  } catch {
    throw new Response(
      JSON.stringify({
        success: false,
        error: 'Invalid JSON request body',
      }),
      {
        status: 400,
        headers: { 'content-type': 'application/json' },
      },
    );
  }
}

function getRuntimeEnv() {
  return env as CrowdReportDispatchRuntimeEnv;
}

export const Route = createFileRoute(
  '/internal/api/tasks/crowd-report-dispatch',
)({
  server: {
    middleware: [internalMiddleware],
    handlers: {
      async POST({ request }) {
        let json: unknown;
        try {
          json = await parseOptionalJsonBody(request);
        } catch (error) {
          if (error instanceof Response) {
            return error;
          }
          throw error;
        }

        const parsed = RequestSchema.safeParse(json);
        if (!parsed.success) {
          return Response.json(
            {
              success: false,
              error: 'Invalid crowd report dispatch request',
              issues: parsed.error.issues,
            },
            { status: 400 },
          );
        }

        const runtimeEnv = getRuntimeEnv();
        const rootUrl = runtimeEnv.VITE_ROOT_URL;
        if (!rootUrl) {
          return Response.json(
            { success: false, error: 'VITE_ROOT_URL is missing' },
            { status: 503 },
          );
        }

        const db = getDb();
        if (parsed.data.dryRun) {
          const candidates = await getDispatchableCrowdReportCandidates(db, {
            kind: parsed.data.kind,
            limit: parsed.data.limit,
            rootUrl,
          });
          return Response.json({
            success: true,
            dryRun: true,
            count: candidates.length,
            candidates,
          });
        }

        const token = runtimeEnv.CROWD_REPORT_DISPATCH_GITHUB_TOKEN;
        if (!token) {
          return Response.json(
            {
              success: false,
              error: 'Crowd report dispatch GitHub token is missing',
            },
            { status: 503 },
          );
        }

        const result = await dispatchPendingCrowdReports(db, {
          kind: parsed.data.kind,
          limit: parsed.data.limit,
          rootUrl,
          token,
          owner: runtimeEnv.CROWD_REPORT_DISPATCH_GITHUB_OWNER,
          repo: runtimeEnv.CROWD_REPORT_DISPATCH_GITHUB_REPO,
          eventType: runtimeEnv.CROWD_REPORT_DISPATCH_GITHUB_EVENT_TYPE,
        });
        for (const failure of result.results.filter((item) => !item.success)) {
          console.error('Crowd report dispatch failed', failure);
        }

        return Response.json(
          {
            success: result.success,
            count: result.count,
            dispatched: result.dispatched,
            failed: result.failed,
            results: result.results,
          },
          {
            status: result.count === 0 ? 200 : result.failed > 0 ? 207 : 202,
          },
        );
      },
    },
  },
});
