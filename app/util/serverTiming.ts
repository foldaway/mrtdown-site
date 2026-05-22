import {
  getResponseHeader,
  setResponseHeader,
  type ResponseHeaderName,
} from '@tanstack/react-start/server';

const SERVER_TIMING_HEADER = 'Server-Timing' as ResponseHeaderName;

function sanitizeToken(value: string) {
  return value.replace(/[^!#$%&'*+\-.^_`|~0-9A-Za-z]/g, '_');
}

function sanitizeDescription(value: string) {
  return value.replace(/[\\"]/g, '\\$&');
}

function formatServerTimingEntry(
  name: string,
  durationMs: number,
  description?: string,
) {
  const parts = [
    sanitizeToken(name),
    `dur=${Math.max(0, durationMs).toFixed(1)}`,
  ];
  if (description != null && description !== '') {
    parts.push(`desc="${sanitizeDescription(description)}"`);
  }
  return parts.join(';');
}

export function recordServerTiming(
  name: string,
  durationMs: number,
  description?: string,
) {
  try {
    const nextEntry = formatServerTimingEntry(name, durationMs, description);
    const current = getResponseHeader(SERVER_TIMING_HEADER);
    setResponseHeader(
      SERVER_TIMING_HEADER,
      current != null && current !== ''
        ? `${current}, ${nextEntry}`
        : nextEntry,
    );
  } catch {
    // Server timing is best-effort so scripts and tests can call data helpers
    // outside a TanStack Start request context.
  }
}

export async function timeServerSpan<T>(
  name: string,
  fn: () => Promise<T>,
  description?: string,
) {
  const startedAt = performance.now();
  try {
    return await fn();
  } finally {
    recordServerTiming(name, performance.now() - startedAt, description);
  }
}

export function timeSyncServerSpan<T>(
  name: string,
  fn: () => T,
  description?: string,
) {
  const startedAt = performance.now();
  try {
    return fn();
  } finally {
    recordServerTiming(name, performance.now() - startedAt, description);
  }
}
