import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import {
  getStationProfileReadModel,
  getStationsDirectoryData,
} from './dbQueries/stations';
import { timeServerSpan } from './serverTiming';

const InputSchema = z.object({
  stationId: z.string(),
});

export const getStationProfileFn = createServerFn({ method: 'GET' })
  .inputValidator((val) => InputSchema.parse(val))
  .handler((val) =>
    getStationProfileReadModel(val.data.stationId, {
      includeCommunitySignals: true,
    }),
  );

export const getStationsDirectoryFn = createServerFn({ method: 'GET' }).handler(
  () =>
    timeServerSpan('stations_directory_loader', () =>
      getStationsDirectoryData(),
    ),
);
