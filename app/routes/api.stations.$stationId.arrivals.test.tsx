import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getStationArrivalLinesReadModel: vi.fn(),
}));

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
}));

vi.mock('~/util/dbQueries/stationArrivals', () => ({
  getStationArrivalLinesReadModel: mocks.getStationArrivalLinesReadModel,
}));

import { Route } from './api.stations.$stationId.arrivals';

type ArrivalsRoute = {
  options: {
    server: {
      handlers: {
        GET: (context: { params: { stationId: string } }) => Promise<Response>;
      };
    };
  };
};

const getHandler = () =>
  (Route as unknown as ArrivalsRoute).options.server.handlers.GET;

describe('station arrivals API route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses the compact arrivals read model and keeps its response uncached', async () => {
    const arrivalLines = [{ lineId: 'EWL', arrivalTimings: [] }];
    mocks.getStationArrivalLinesReadModel.mockResolvedValue(arrivalLines);

    const response = await getHandler()({ params: { stationId: 'EW1' } });

    expect(mocks.getStationArrivalLinesReadModel).toHaveBeenCalledWith('EW1');
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: arrivalLines,
    });
  });

  it('returns the existing generic failure response when the arrivals read fails', async () => {
    mocks.getStationArrivalLinesReadModel.mockRejectedValue(
      new Error('db down'),
    );

    const response = await getHandler()({ params: { stationId: 'EW1' } });

    expect(response.status).toBe(500);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'Arrival refresh failed',
    });
  });
});
