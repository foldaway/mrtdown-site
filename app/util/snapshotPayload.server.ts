import { createHash } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';

export type SnapshotLimits = { encodedBytes: number; jsonBytes: number };
export const DEFAULT_SNAPSHOT_LIMITS: SnapshotLimits = {
  encodedBytes: 4 * 1024 * 1024,
  jsonBytes: 24 * 1024 * 1024,
};
export const snapshotDigest = (raw: string) =>
  createHash('sha256').update(raw).digest('hex');

export function encodeSnapshotPayload<T>(
  inputs: T,
  parse: (value: unknown) => T,
  limits = DEFAULT_SNAPSHOT_LIMITS,
) {
  const json = JSON.stringify(parse(inputs));
  if (Buffer.byteLength(json) > limits.jsonBytes)
    throw new Error('Snapshot exceeds JSON limit');
  const encoded = gzipSync(json).toString('base64');
  const bytes = Buffer.byteLength(encoded);
  if (bytes > limits.encodedBytes)
    throw new Error('Snapshot exceeds Redis limit');
  return { encoded, sha256: snapshotDigest(encoded), bytes };
}

export function decodeSnapshotPayload<T>(
  encoded: string,
  sha256: string,
  parse: (value: unknown) => T,
  limits = DEFAULT_SNAPSHOT_LIMITS,
) {
  if (
    !encoded ||
    Buffer.byteLength(encoded) > limits.encodedBytes ||
    snapshotDigest(encoded) !== sha256 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)
  )
    throw new Error('Invalid snapshot payload');
  const json = gunzipSync(Buffer.from(encoded, 'base64'), {
    maxOutputLength: limits.jsonBytes,
  }).toString('utf8');
  return parse(JSON.parse(json));
}
