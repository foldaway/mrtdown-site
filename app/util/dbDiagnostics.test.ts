import { describe, expect, it, vi } from 'vitest';
import {
  DbDiagnosticError,
  formatDbDiagnosticMessage,
  withDbDiagnostics,
} from './dbDiagnostics';

describe('formatDbDiagnosticMessage', () => {
  it('includes context and Postgres error fields from the cause chain', () => {
    const error = new Error('Failed query', {
      cause: {
        name: 'DatabaseError',
        message: 'invalid byte sequence for encoding "UTF8"',
        code: '22021',
        severity: 'ERROR',
        table: 'public_holidays',
        where: 'unnamed portal parameter $4',
      },
    });

    expect(
      formatDbDiagnosticMessage(
        {
          prefix: 'PUBLIC_HOLIDAYS_DB_ERROR',
          operation: 'sync',
          table: 'public_holidays',
          rowCount: 80,
          sample: ['sg-public-holiday-2020-01-01-new-year-s-day'],
        },
        error,
      ),
    ).toBe(
      [
        '[PUBLIC_HOLIDAYS_DB_ERROR] sync failed on public_holidays',
        'row_count=80',
        'sample=sg-public-holiday-2020-01-01-new-year-s-day',
        'cause[0] Error: Failed query',
        'cause[1] DatabaseError: invalid byte sequence for encoding "UTF8" (code=22021, severity=ERROR, table=public_holidays, where=unnamed portal parameter $4)',
      ].join('\n'),
    );
  });
});

describe('withDbDiagnostics', () => {
  it('logs and wraps failed operations', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const cause = new Error('boom');

    await expect(() =>
      withDbDiagnostics(
        {
          prefix: 'TEST_DB_ERROR',
          operation: 'insert rows',
          table: 'test_table',
        },
        async () => {
          throw cause;
        },
        { errorName: 'TestDbError' },
      ),
    ).rejects.toMatchObject({
      name: 'TestDbError',
      cause,
    });

    expect(consoleError).toHaveBeenCalledWith(
      [
        '[TEST_DB_ERROR] insert rows failed on test_table',
        'cause[0] Error: boom',
      ].join('\n'),
    );
    consoleError.mockRestore();
  });

  it('does not double-wrap diagnostic errors', async () => {
    const error = new DbDiagnosticError('already wrapped', {
      cause: new Error('boom'),
      name: 'ExistingDbError',
    });

    await expect(() =>
      withDbDiagnostics(
        {
          prefix: 'TEST_DB_ERROR',
          operation: 'insert rows',
          table: 'test_table',
        },
        async () => {
          throw error;
        },
      ),
    ).rejects.toBe(error);
  });
});
