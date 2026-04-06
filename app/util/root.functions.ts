import { createServerFn } from '@tanstack/react-start';
import z from 'zod';
import {
  getLines,
  getMetadata,
  getOperators,
  type IncludedEntities,
} from '~/client';
import { assert } from './assert';

const InputSchema = z.object({
  lang: z.string().optional().default('en-SG'),
});

export const getRootFn = createServerFn({ method: 'GET' })
  .inputValidator((val) => InputSchema.parse(val))
  .handler(async (val) => {
    const { lang } = val.data;

    const { data, error, response } = await getLines({
      auth: () => process.env.API_TOKEN,
      baseUrl: process.env.API_ENDPOINT,
    });
    if (error != null) {
      console.error('Error fetching lines:', error);
      throw new Response('Failed to fetch lines', {
        status: response.status,
        statusText: response.statusText,
      });
    }
    assert(data != null);

    const metadataResponse = await getMetadata({
      auth: () => process.env.API_TOKEN,
      baseUrl: process.env.API_ENDPOINT,
    });
    if (metadataResponse.error != null) {
      console.error('Error fetching metadata:', metadataResponse.error);
      throw new Response('Failed to fetch metadata', {
        status: metadataResponse.response.status,
        statusText: metadataResponse.response.statusText,
      });
    }
    assert(metadataResponse.data != null);

    const metadata = metadataResponse.data.data;

    const { lineIds } = data.data;
    const { included } = data;

    const operatorsResponse = await getOperators({
      auth: () => process.env.API_TOKEN,
      baseUrl: process.env.API_ENDPOINT,
    });
    if (operatorsResponse.error != null) {
      console.error('Error fetching operators:', operatorsResponse.error);
      throw new Response('Failed to fetch operators', {
        status: operatorsResponse.response.status,
        statusText: operatorsResponse.response.statusText,
      });
    }
    assert(operatorsResponse.data != null);
    // Type assertion needed since GetOperatorsResponses[200] is unknown
    const operatorsData = operatorsResponse.data as {
      success: true;
      included: IncludedEntities;
      data: { operatorIds: Array<string> };
    };

    const { default: messages } = await import(`../../lang/${lang}.json`);

    return {
      lineIds,
      included,
      metadata,
      operatorIds: operatorsData.data.operatorIds,
      operatorsIncluded: operatorsData.included.operators,
      messages,
    };
  });
