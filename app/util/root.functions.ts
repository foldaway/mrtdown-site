import { env } from 'cloudflare:workers';
import { createServerFn } from '@tanstack/react-start';
import z from 'zod';
import {
  type CrowdReportFeatureEnv,
  isCrowdReportsFeatureEnabled,
} from './crowdReportFeatureFlag';
import { getRootData } from './db.queries';
import { timeServerSpan } from './serverTiming';

const InputSchema = z.object({
  lang: z.string().optional().default('en-SG'),
});

export const getRootFn = createServerFn({ method: 'GET' })
  .inputValidator((val) => InputSchema.parse(val))
  .handler(async (val) => {
    const { lang } = val.data;
    const { lineNavItems, metadata, operatorNavItems } = await timeServerSpan(
      'root_loader',
      () => getRootData(),
    );

    const { default: messages } = await timeServerSpan(
      'root_messages',
      () => import(`../../lang/${lang}.json`),
      lang,
    );

    return {
      crowdReportsEnabled: isCrowdReportsFeatureEnabled(
        env as CrowdReportFeatureEnv,
        { isLocalDev: import.meta.env.DEV },
      ),
      lineNavItems,
      metadata,
      operatorNavItems,
      messages,
    };
  });
