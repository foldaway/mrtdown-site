/**
 * Fetches the zip archive from mrtdown-data as a single buffer for AdmZip.
 */
const ARCHIVE_FETCH_TIMEOUT_MS = 30_000;
const MAX_ARCHIVE_BYTES = 50 * 1024 * 1024;

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

async function readBoundedBody(
  response: Response,
  controller: AbortController,
): Promise<Buffer> {
  const contentLength = Number.parseInt(
    response.headers.get('content-length') ?? '',
    10,
  );
  if (Number.isFinite(contentLength) && contentLength > MAX_ARCHIVE_BYTES) {
    throw new Error(`archive.zip too large: ${contentLength} bytes`);
  }

  if (response.body == null) {
    const ab = await response.arrayBuffer();
    if (ab.byteLength > MAX_ARCHIVE_BYTES) {
      throw new Error(`archive.zip too large: ${ab.byteLength} bytes`);
    }
    return Buffer.from(ab);
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value == null) continue;

    total += value.byteLength;
    if (total > MAX_ARCHIVE_BYTES) {
      controller.abort();
      throw new Error(`archive.zip too large: ${total} bytes`);
    }
    chunks.push(value);
  }

  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return Buffer.from(out);
}

export async function fetchArchive(mrtdownDataUrl: string): Promise<Buffer> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    ARCHIVE_FETCH_TIMEOUT_MS,
  );

  try {
    const response = await fetch(`${mrtdownDataUrl}/archive.zip`, {
      headers: {
        Accept: 'application/zip',
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(
        `archive.zip returned ${response.status}: ${await response.text()}`,
      );
    }
    return await readBoundedBody(response, controller);
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error(
        `archive.zip fetch timed out after ${ARCHIVE_FETCH_TIMEOUT_MS}ms`,
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
