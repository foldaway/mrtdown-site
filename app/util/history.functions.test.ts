import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import {
  parseHistoryYearMonthParams,
  parseHistoryYearParam,
} from './history.functions';

describe('parseHistoryYearParam', () => {
  it('coerces valid year route params', () => {
    expect(parseHistoryYearParam('2025')).toBe(2025);
  });

  it('rejects invalid year route params', () => {
    const maxYear = DateTime.now().year + 10;

    expect(parseHistoryYearParam('not-a-year')).toBeNull();
    expect(parseHistoryYearParam('2025.5')).toBeNull();
    expect(parseHistoryYearParam('1979')).toBeNull();
    expect(parseHistoryYearParam((maxYear + 1).toString())).toBeNull();
  });
});

describe('parseHistoryYearMonthParams', () => {
  it('coerces valid year and month route params', () => {
    expect(parseHistoryYearMonthParams('2025', '01')).toEqual({
      year: 2025,
      month: 1,
    });
  });

  it('rejects invalid month route params', () => {
    expect(parseHistoryYearMonthParams('2025', '0')).toBeNull();
    expect(parseHistoryYearMonthParams('2025', '13')).toBeNull();
    expect(parseHistoryYearMonthParams('2025', '1.5')).toBeNull();
    expect(parseHistoryYearMonthParams('2025', 'not-a-month')).toBeNull();
  });
});
