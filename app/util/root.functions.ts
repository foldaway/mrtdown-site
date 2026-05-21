import { createServerFn } from '@tanstack/react-start';
import z from 'zod';
import { getRootData } from './db.queries';

const InputSchema = z.object({
  lang: z.string().optional().default('en-SG'),
});

export const getRootFn = createServerFn({ method: 'GET' })
  .inputValidator((val) => InputSchema.parse(val))
  .handler(async (val) => {
    const { lang } = val.data;
    const { lineNavItems, metadata, operatorNavItems } = await getRootData();

    const { default: messages } = await import(`../../lang/${lang}.json`);

    return {
      lineNavItems,
      metadata,
      operatorNavItems,
      messages,
    };
  });
