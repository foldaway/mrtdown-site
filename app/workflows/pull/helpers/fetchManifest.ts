import type { Manifest } from '@mrtdown/core';

/**
 * Fetches the manifest from mrtdown-data
 */
export async function fetchManifest(mrtdownDataUrl: string): Promise<Manifest> {
  const response = await fetch(`${mrtdownDataUrl}/manifest.json`, {
    headers: {
      Accept: 'application/json',
    },
  });
  if (!response.ok) {
    throw new Error(
      `manifest.json returned ${response.status}: ${await response.text()}`,
    );
  }
  const manifest: Manifest = await response.json();
  return manifest;
}
