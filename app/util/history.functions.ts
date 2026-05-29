import { createServerFn } from '@tanstack/react-start';
import { DateTime } from 'luxon';
import z from 'zod';
import {
  getHistoryYearMonthData,
  getHistoryYearSummaryData,
} from './db.queries';

const YearSchema = z.coerce.number().int();
const MonthSchema = z.coerce.number().int();

function isHistoryYearInRange(year: number) {
  const minYear = 1980;
  const maxYear = DateTime.now().year + 10;
  return year >= minYear && year <= maxYear;
}

function isHistoryMonthInRange(month: number) {
  return month >= 1 && month <= 12;
}

const YearInputSchema = z.object({
  year: YearSchema,
});

export function parseHistoryYearParam(year: unknown) {
  const result = YearSchema.safeParse(year);
  if (!result.success || !isHistoryYearInRange(result.data)) {
    return null;
  }

  return result.data;
}

export const getIssuesHistoryYearFn = createServerFn({ method: 'GET' })
  .inputValidator(YearInputSchema)
  .handler((val) => getHistoryYearSummaryData(val.data.year));

const YearMonthInputSchema = z.object({
  year: YearSchema,
  month: MonthSchema,
});

export function parseHistoryYearMonthParams(year: unknown, month: unknown) {
  const result = YearMonthInputSchema.safeParse({ year, month });
  if (
    !result.success ||
    !isHistoryYearInRange(result.data.year) ||
    !isHistoryMonthInRange(result.data.month)
  ) {
    return null;
  }

  return result.data;
}

export const getIssuesHistoryYearMonthFn = createServerFn({ method: 'GET' })
  .inputValidator(YearMonthInputSchema)
  .handler((val) => getHistoryYearMonthData(val.data.year, val.data.month));
