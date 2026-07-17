import { createServerFn } from '@tanstack/react-start';
import z from 'zod';
import { getLineProfileData, getLinesDirectoryData } from './dbQueries/lines';
import { timeServerSpan } from './serverTiming';

export const getLinesDirectoryFn = createServerFn({ method: 'GET' }).handler(
  () =>
    timeServerSpan('lines_directory_loader', () => getLinesDirectoryData(90)),
);

const InputSchema = z.object({
  lineId: z.string(),
  days: z.number().optional().default(90),
});

export const getLineProfileFn = createServerFn({ method: 'GET' })
  .inputValidator((val) => InputSchema.parse(val))
  .handler(async (val) => {
    return getLineProfileData(val.data.lineId, val.data.days, {
      includeCommunitySignals: true,
    });
  });
