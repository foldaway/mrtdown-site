import { createServerFn } from '@tanstack/react-start';
import { DateTime } from 'luxon';
import z from 'zod';
import {
  getIssuesHistoryYearMonth,
  getIssuesHistoryYearSummary,
} from '~/client';
import { assert } from './assert';

const YearSchema = z.coerce.number().refine(
  (year) => {
    const minYear = 1980;
    const maxYear = DateTime.now().year + 10;
    return year >= minYear && year <= maxYear;
  },
  {
    message: 'Year is out of range',
  },
);

const YearInputSchema = z.object({
  year: YearSchema,
});

export const getIssuesHistoryYearFn = createServerFn({ method: 'GET' })
  .inputValidator(YearInputSchema)
  .handler(async (val) => {
    const { data, error } = await getIssuesHistoryYearSummary({
      auth: () => process.env.API_TOKEN,
      baseUrl: process.env.API_ENDPOINT,
      path: {
        year: val.data.year.toString(),
      },
    });
    if (error != null) {
      console.error('Error fetching issues for year:', error);
      throw new Response('Failed to fetch issues for year', {
        status: 500,
        statusText: 'Internal Server Error',
      });
    }
    assert(data != null);
    return data;
  });

const YearMonthInputSchema = z.object({
  year: YearSchema,
  month: z.coerce.number().min(1).max(12),
});

export const getIssuesHistoryYearMonthFn = createServerFn({ method: 'GET' })
  .inputValidator(YearMonthInputSchema)
  .handler(async (val) => {
    const { data, error } = await getIssuesHistoryYearMonth({
      auth: () => process.env.API_TOKEN,
      baseUrl: process.env.API_ENDPOINT,
      path: {
        year: val.data.year.toString(),
        month: val.data.month.toString().padStart(2, '0'),
      },
    });
    if (error != null) {
      console.error('Error fetching issues for year-month:', error);
      throw new Response('Failed to fetch issues for year-month', {
        status: 500,
        statusText: 'Internal Server Error',
      });
    }
    assert(data != null);
    return data;
  });
