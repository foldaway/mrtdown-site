import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { getStationProfileData } from './db.queries';

const InputSchema = z.object({
  stationId: z.string(),
});

export const getStationProfileFn = createServerFn({ method: 'GET' })
  .inputValidator((val) => InputSchema.parse(val))
  .handler((val) => getStationProfileData(val.data.stationId));
