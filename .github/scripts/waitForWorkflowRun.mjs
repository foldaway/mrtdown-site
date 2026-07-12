import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@upstash/workflow';

const TERMINAL_STATES = new Set(['RUN_SUCCESS', 'RUN_FAILED', 'RUN_CANCELED']);

export async function waitForWorkflowRun(
  client,
  workflowRunId,
  {
    intervalMs = 30_000,
    timeoutMs = 29 * 60_000,
    sleep = (milliseconds) =>
      new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds)),
    onPoll = console.log,
  } = {},
) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const { runs } = await client.logs({
      count: 1,
      filter: { workflowRunId },
    });
    const run = runs.find(
      (candidate) => candidate.workflowRunId === workflowRunId,
    );
    if (run != null) {
      onPoll(`${workflowRunId}: ${run.workflowState}`);
      if (TERMINAL_STATES.has(run.workflowState)) {
        if (run.workflowState !== 'RUN_SUCCESS') {
          throw new Error(
            `Workflow ${workflowRunId} ended with ${run.workflowState}`,
          );
        }
        return run;
      }
    } else {
      onPoll(`${workflowRunId}: waiting for run logs`);
    }

    await sleep(intervalMs);
  }

  throw new Error(`Timed out waiting for workflow ${workflowRunId}`);
}

async function main() {
  const workflowRunId = process.argv[2];
  if (!workflowRunId) {
    throw new Error('Pass a workflow run ID');
  }

  const client = new Client({
    baseUrl: process.env.QSTASH_URL,
    token: process.env.QSTASH_TOKEN,
  });
  await waitForWorkflowRun(client, workflowRunId);
}

const entryPath = process.argv[1] == null ? null : resolve(process.argv[1]);
if (entryPath === fileURLToPath(import.meta.url)) {
  await main();
}
