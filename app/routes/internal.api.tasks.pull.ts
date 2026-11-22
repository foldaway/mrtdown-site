import { CombinedTimetableReleaseIndexSchema } from '@mrtdown/fs';
import { createFileRoute } from '@tanstack/react-router';
import { internalMiddleware } from '~/util/internal.middleware';
import { getClient } from '~/workflows/client';
import { PullParamsSchema } from '~/workflows/pull/helpers/pullParams';

function pullWorkflowUrls() {
  const legacy = new URL(
    '/internal/api/workflows/pull',
    process.env.VITE_ROOT_URL,
  ).toString();
  const configured = process.env.PULL_WORKFLOW_URL;
  if (!configured) return [legacy];
  const url = new URL(configured);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/internal/api/workflows/pull'
  )
    throw new Error('PULL_WORKFLOW_URL must be an HTTPS pull workflow URL');
  return [...new Set([url.toString(), legacy])];
}

export async function handlePullPost(request: Request) {
  let json: unknown;
  try {
    const text = await request.text();
    json = text.trim() === '' ? {} : JSON.parse(text);
  } catch {
    return Response.json(
      { error: 'Invalid JSON request body' },
      { status: 400 },
    );
  }
  const parsed = PullParamsSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { error: 'Invalid canonical pull request' },
      { status: 400 },
    );
  }
  const { workflowRunId } = await getClient().trigger({
    url: pullWorkflowUrls()[0],
    body: parsed.data,
    headers: {
      'Content-Type': 'application/json',
    },
    flowControl: {
      key: 'internal-api',
      parallelism: 1,
    },
  });
  return Response.json({ workflowRunId }, { status: 202 });
}

export async function handlePullGet(request: Request) {
  const workflowRunId = new URL(request.url).searchParams.get('workflowRunId');
  if (!workflowRunId || !/^[A-Za-z0-9_-]{1,200}$/.test(workflowRunId)) {
    return Response.json(
      { error: 'A workflow run ID is required' },
      { status: 400 },
    );
  }
  const client = getClient();
  let run: Awaited<ReturnType<typeof client.logs>>['runs'][number] | undefined;
  for (const workflowUrl of pullWorkflowUrls()) {
    const { runs } = await client.logs({
      filter: { workflowRunId, workflowUrl },
      count: 1,
    });
    run = runs.find(
      (value) =>
        value.workflowRunId === workflowRunId &&
        value.workflowUrl === workflowUrl,
    );
    if (run) break;
  }
  if (!run)
    return Response.json(
      { workflowRunId, state: 'PENDING' },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  let combinedReleaseIndex = null;
  if (run.workflowState === 'RUN_SUCCESS') {
    try {
      const result = JSON.parse(run.workflowRunResponse ?? 'null');
      if (result?.combinedReleaseIndex)
        combinedReleaseIndex = CombinedTimetableReleaseIndexSchema.parse(
          result.combinedReleaseIndex,
        );
    } catch {
      return Response.json(
        { error: 'Invalid completed pull receipt' },
        { status: 502 },
      );
    }
  }
  // Expose only completion and the imported identity, never logs or request headers.
  return Response.json(
    { workflowRunId, state: run.workflowState, combinedReleaseIndex },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export const Route = createFileRoute('/internal/api/tasks/pull')({
  server: {
    middleware: [internalMiddleware],
    handlers: {
      POST: ({ request }) => handlePullPost(request),
      GET: ({ request }) => handlePullGet(request),
    },
  },
});
