import { createServerFn } from '@tanstack/react-start';
import z from 'zod';
import { getDateCountForViewport } from '~/helpers/getDateCountForViewport';
import { ViewportSchema } from '~/hooks/useViewport';
import { getOverviewData } from './db.queries';

const RequestSchema = z.object({
  viewport: ViewportSchema.optional(),
});

export const getOverviewFn = createServerFn({ method: 'GET' })
  .inputValidator((val) => RequestSchema.parse(val))
  .handler(async (val) => {
    const viewport = val.data.viewport ?? 'xs';
    const dateCount = getDateCountForViewport(viewport);
    return getOverviewData(dateCount);
  });
