import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadOrNotFound } from './loadOrNotFound';

const mocks = vi.hoisted(() => ({
  notFound: vi.fn(),
}));

vi.mock('@tanstack/react-router', () => ({
  notFound: mocks.notFound,
}));

describe('loadOrNotFound', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws TanStack Router notFound for a missing resource response', async () => {
    const notFoundError = { type: 'not-found' };
    mocks.notFound.mockReturnValue(notFoundError);

    await expect(
      loadOrNotFound(() =>
        Promise.reject(new Response('Not Found', { status: 404 })),
      ),
    ).rejects.toBe(notFoundError);

    expect(mocks.notFound).toHaveBeenCalledOnce();
  });

  it('preserves non-404 failures', async () => {
    const error = new Error('Database unavailable');

    await expect(loadOrNotFound(() => Promise.reject(error))).rejects.toBe(
      error,
    );
    expect(mocks.notFound).not.toHaveBeenCalled();
  });
});
