import { createFileRoute } from '@tanstack/react-router';
import { internalMiddleware } from '~/util/internal.middleware';
import { getClient } from '~/workflows/client';
import { PullParamsSchema } from '~/workflows/pull/helpers/pullParams';

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
    url: new URL(
      '/internal/api/workflows/pull',
      process.env.VITE_ROOT_URL,
    ).toString(),
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

export const Route = createFileRoute('/internal/api/tasks/pull')({
  server: {
    middleware: [internalMiddleware],
    handlers: {
      POST: ({ request }) => handlePullPost(request),
    },
  },
});
