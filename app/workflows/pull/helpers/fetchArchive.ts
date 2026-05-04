/**
 * Fetches the zip archive from mrtdown-data as a single buffer for AdmZip.
 */
export async function fetchArchive(mrtdownDataUrl: string): Promise<Buffer> {
  const response = await fetch(`${mrtdownDataUrl}/archive.zip`, {
    headers: {
      Accept: 'application/zip',
    },
  });
  if (!response.ok) {
    throw new Error(
      `archive.zip returned ${response.status}: ${await response.text()}`,
    );
  }
  const ab = await response.arrayBuffer();
  return Buffer.from(ab);
}
