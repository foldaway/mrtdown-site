import { env } from 'cloudflare:workers';
import { createServerFn } from '@tanstack/react-start';
import z from 'zod';
import {
  type CrowdReportFeatureEnv,
  isCrowdReportsFeatureEnabled,
} from './crowdReportFeatureFlag';
import { getRootData } from './db/queries/root';
import { getLocaleMessages } from './localeMessages';
import { timeServerSpan } from './serverTiming';

const InputSchema = z.object({
  lang: z.string().optional().default('en-SG'),
});

export const getRootFn = createServerFn({ method: 'GET' })
  .inputValidator((val) => InputSchema.parse(val))
  .handler(async (val) => {
    const { lang } = val.data;
    const rootDataPromise = timeServerSpan('root_loader', () => getRootData());

    const messagesPromise = timeServerSpan(
      'root_messages',
      () => getLocaleMessages(lang),
      lang,
    );
    const { lineNavItems, metadata, operatorNavItems } = await rootDataPromise;
    const messages = await messagesPromise;

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
