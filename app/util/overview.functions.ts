import { createServerFn } from '@tanstack/react-start';
import z from 'zod';
import { HOME_OVERVIEW_INITIAL_DATE_COUNT } from '~/constants';
import { getOverviewData } from './dbQueries/overview';
import { timeServerSpan } from './serverTiming';

const RequestSchema = z.object({
  days: z.union([z.literal(30), z.literal(60), z.literal(90)]).optional(),
});

export const getOverviewFn = createServerFn({ method: 'GET' })
  .inputValidator((val) => RequestSchema.parse(val))
  .handler(async (val) => {
    const days = val.data.days ?? HOME_OVERVIEW_INITIAL_DATE_COUNT;
    return timeServerSpan(
      'overview_loader',
      () =>
        getOverviewData(days, {
          includeCommunitySignals: true,
        }),
      `days=${days}`,
    );
  });
