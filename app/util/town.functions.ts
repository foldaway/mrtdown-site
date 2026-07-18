import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { getTownProfileReadModel, getTownsData } from './dbQueries/towns';

const TownProfileInputSchema = z.object({
  townId: z.string(),
});

export const getTownsFn = createServerFn({ method: 'GET' }).handler(() =>
  getTownsData(),
);

export const getTownProfileFn = createServerFn({ method: 'GET' })
  .inputValidator((value) => TownProfileInputSchema.parse(value))
  .handler((value) => getTownProfileReadModel(value.data.townId));
