export function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function readStringField(value: unknown, field: string) {
  if (!isRecord(value)) {
    return null;
  }

  const fieldValue = value[field];
  return typeof fieldValue === 'string' ? fieldValue : null;
}

export function isMissingTableError(error: unknown) {
  let current: unknown = error;
  const seen = new Set<unknown>();

  for (let depth = 0; current != null && depth < 6; depth++) {
    if (seen.has(current)) {
      break;
    }
    seen.add(current);

    const code = readStringField(current, 'code');
    if (code === '42P01') {
      return true;
    }

    const message =
      current instanceof Error
        ? current.message
        : readStringField(current, 'message');
    if (
      message != null &&
      /\bno such table\b/i.test(message) &&
      (message.includes('D1_ERROR') ||
        message.includes('SQLITE_ERROR') ||
        code === 'SQLITE_ERROR')
    ) {
      return true;
    }

    current = isRecord(current) ? current.cause : null;
  }

  return false;
}
