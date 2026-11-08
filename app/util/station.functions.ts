import { createServerFn } from '@tanstack/react-start';
import { setResponseHeader } from '@tanstack/react-start/server';
import { z } from 'zod';
import {
  getStationProfileReadModel,
  getStationsDirectoryData,
} from './dbQueries/stations';
import { STATION_PROFILE_FRESH_UNTIL_HEADER } from './publicResponseCache';
import { timeServerSpan } from './serverTiming';

const InputSchema = z.object({
  stationId: z.string(),
});

export const getStationProfileFn = createServerFn({ method: 'GET' })
  .inputValidator((val) => InputSchema.parse(val))
  .handler(async (val) => {
    const { freshUntil, ...profile } = await getStationProfileReadModel(
      val.data.stationId,
      {
        includeCommunitySignals: true,
      },
    );
    setResponseHeader(STATION_PROFILE_FRESH_UNTIL_HEADER, String(freshUntil));
    return profile;
  });

export const getStationsDirectoryFn = createServerFn({ method: 'GET' }).handler(
  () =>
    timeServerSpan('stations_directory_loader', () =>
      getStationsDirectoryData(),
    ),
);
