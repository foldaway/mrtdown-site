import { setResponseHeader } from '@tanstack/react-start/server';
import { beforeEach, expect, it, vi } from 'vitest';
import { getStationProfileReadModel } from './dbQueries/stations';
import { getStationProfileFn } from './station.functions';

vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => {
    const handler = (handle: (input: { data: unknown }) => unknown) => handle;
    return {
      handler,
      inputValidator: (validate: (input: unknown) => unknown) => ({
        handler:
          (handle: (input: { data: unknown }) => unknown) =>
          ({ data }: { data: unknown }) =>
            handle({ data: validate(data) }),
      }),
    };
  },
}));
vi.mock('@tanstack/react-start/server', () => ({ setResponseHeader: vi.fn() }));
vi.mock('./dbQueries/stations', () => ({
  getStationProfileReadModel: vi.fn(),
  getStationsDirectoryData: vi.fn(),
}));
beforeEach(() => vi.resetAllMocks());

it.each([
  new Response('Station not found', { status: 404 }),
  new Error('SQL unavailable'),
])(
  'keeps profile errors uncached, including the thrown Response itself',
  async (error) => {
    vi.mocked(getStationProfileReadModel).mockRejectedValue(error);
    await expect(
      getStationProfileFn({ data: { stationId: 'unknown' } }),
    ).rejects.toBe(error);
    expect(setResponseHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    if (error instanceof Response)
      expect(error.headers.get('cache-control')).toBe('no-store');
  },
);
