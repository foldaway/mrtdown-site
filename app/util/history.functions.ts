import { createServerFn } from '@tanstack/react-start';
import { DateTime } from 'luxon';
import z from 'zod';
import {
  getHistoryYearMonthData,
  getHistoryYearSummaryData,
} from './db.queries';

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
  .handler((val) => getHistoryYearSummaryData(val.data.year));

const YearMonthInputSchema = z.object({
  year: YearSchema,
  month: z.coerce.number().min(1).max(12),
});

export const getIssuesHistoryYearMonthFn = createServerFn({ method: 'GET' })
  .inputValidator(YearMonthInputSchema)
  .handler((val) => getHistoryYearMonthData(val.data.year, val.data.month));
