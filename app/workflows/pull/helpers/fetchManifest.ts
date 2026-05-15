import type { Manifest } from '@mrtdown/core';

const MANIFEST_FETCH_TIMEOUT_MS = 15_000;

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

/**
 * Fetches the manifest from mrtdown-data
 */
export async function fetchManifest(mrtdownDataUrl: string): Promise<Manifest> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    MANIFEST_FETCH_TIMEOUT_MS,
  );

  try {
    const response = await fetch(`${mrtdownDataUrl}/manifest.json`, {
      headers: {
        Accept: 'application/json',
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(
        `manifest.json returned ${response.status}: ${await response.text()}`,
      );
    }
    const manifest: Manifest = await response.json();
    return manifest;
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error(
        `manifest.json fetch timed out after ${MANIFEST_FETCH_TIMEOUT_MS}ms`,
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
