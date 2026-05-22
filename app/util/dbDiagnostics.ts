export type DbDiagnosticContext = {
  prefix: string;
  operation: string;
  table: string;
  rowCount?: number;
  sample?: readonly string[];
};

export class DbDiagnosticError extends Error {
  constructor(message: string, options: { cause: unknown; name?: string }) {
    super(message, { cause: options.cause });
    this.name = options.name ?? 'DbDiagnosticError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function stringifyErrorField(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return null;
}

function readErrorField(error: unknown, field: string): string | null {
  if (!isRecord(error)) return null;
  return stringifyErrorField(error[field]);
}

export function formatErrorCauseChain(error: unknown): string[] {
  const lines: string[] = [];
  let current: unknown = error;
  const seen = new Set<unknown>();

  for (let depth = 0; current != null && depth < 6; depth++) {
    if (seen.has(current)) break;
    seen.add(current);

    const name =
      current instanceof Error
        ? current.name
        : (readErrorField(current, 'name') ?? typeof current);
    const message =
      current instanceof Error
        ? current.message
        : (readErrorField(current, 'message') ?? String(current));
    const fields = [
      'code',
      'severity',
      'schema',
      'table',
      'column',
      'constraint',
      'detail',
      'hint',
      'where',
      'routine',
    ]
      .map((field) => {
        const value = readErrorField(current, field);
        return value == null ? null : `${field}=${value}`;
      })
      .filter((field): field is string => field != null);

    lines.push(
      `cause[${depth}] ${name}: ${message}${
        fields.length > 0 ? ` (${fields.join(', ')})` : ''
      }`,
    );

    current = isRecord(current) ? current.cause : null;
  }

  return lines;
}

export function formatDbDiagnosticMessage(
  context: DbDiagnosticContext,
  error: unknown,
): string {
  const lines = [
    `[${context.prefix}] ${context.operation} failed on ${context.table}`,
  ];
  if (context.rowCount != null) {
    lines.push(`row_count=${context.rowCount}`);
  }
  if (context.sample != null && context.sample.length > 0) {
    lines.push(`sample=${context.sample.join(' | ')}`);
  }
  lines.push(...formatErrorCauseChain(error));
  return lines.join('\n');
}

export async function withDbDiagnostics<T>(
  context: DbDiagnosticContext,
  operation: () => Promise<T>,
  options: { errorName?: string } = {},
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof DbDiagnosticError) {
      throw error;
    }
    const message = formatDbDiagnosticMessage(context, error);
    console.error(message);
    throw new DbDiagnosticError(message, {
      cause: error,
      name: options.errorName,
    });
  }
}
