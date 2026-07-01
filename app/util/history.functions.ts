import { createServerFn } from '@tanstack/react-start';
import z from 'zod';
import {
  getHistoryYearMonthData,
  getHistoryYearSummaryData,
} from './db/queries';
import {
  HISTORY_YEAR_BOUNDS,
  isHistoryYearInBounds,
} from './historyYearBounds';

function isHistoryYearInRange(year: number) {
  return isHistoryYearInBounds(year, HISTORY_YEAR_BOUNDS);
}

function isHistoryMonthInRange(month: number) {
  return month >= 1 && month <= 12;
}

const YearSchema = z.coerce.number().int();
const HistoryYearSchema = YearSchema.refine(isHistoryYearInRange, {
  message: 'Year is out of range',
});
const MonthSchema = z.coerce.number().int();
const HistoryMonthSchema = MonthSchema.min(1).max(12);

const YearInputSchema = z.object({
  year: HistoryYearSchema,
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
  year: HistoryYearSchema,
  month: HistoryMonthSchema,
});
const YearMonthParamSchema = z.object({
  year: YearSchema,
  month: MonthSchema,
});

export function parseHistoryYearMonthParams(year: unknown, month: unknown) {
  const result = YearMonthParamSchema.safeParse({ year, month });
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
