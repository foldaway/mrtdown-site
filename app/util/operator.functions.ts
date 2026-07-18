import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { getOperatorProfileReadModel } from './dbQueries/operators';

const InputSchema = z.object({
  operatorId: z.string(),
  days: z.number().optional().default(90),
});

export const getOperatorProfileFn = createServerFn({ method: 'GET' })
  .inputValidator((val) => InputSchema.parse(val))
  .handler(async (val) => {
    const { operatorId, days } = val.data;
    const data = await getOperatorProfileReadModel(operatorId, days);
    return { ...data, dateCount: days };
  });
