import { describe, expect, test } from 'vitest';

import { computeStartOfDaysWithinInterval } from './computeStartOfDaysWithinInterval';
import { DateTime } from 'luxon';

describe('computeStartOfDaysWithinInterval', () => {
  test('interval that does not transcend days', () => {
    expect(
      computeStartOfDaysWithinInterval(
        DateTime.fromObject({
          day: 1,
          month: 4,
          year: 2025,
          hour: 12,
          minute: 30,
        }),
        DateTime.fromObject({
          day: 1,
          month: 4,
          year: 2025,
          hour: 15,
          minute: 30,
        }),
      ),
    ).toEqual([] satisfies DateTime[]);
  });

  test('interval that starts from midnight', () => {
    expect(
      computeStartOfDaysWithinInterval(
        DateTime.fromObject({
          day: 1,
          month: 4,
          year: 2025,
          hour: 0,
          minute: 0,
        }),
        DateTime.fromObject({
          day: 1,
          month: 4,
          year: 2025,
          hour: 15,
          minute: 30,
        }),
      ),
    ).toEqual([
      DateTime.fromObject({
        day: 1,
        month: 4,
        year: 2025,
        hour: 0,
        minute: 0,
      }),
    ] satisfies DateTime[]);
  });

  test('interval that ends at midnight', () => {
    expect(
      computeStartOfDaysWithinInterval(
        DateTime.fromObject({
          day: 1,
          month: 4,
          year: 2025,
          hour: 15,
          minute: 30,
        }),
        DateTime.fromObject({
          day: 2,
          month: 4,
          year: 2025,
          hour: 0,
          minute: 0,
        }),
      ),
    ).toEqual([] satisfies DateTime[]);
  });

  test('interval that transcends 2 days', () => {
    expect(
      computeStartOfDaysWithinInterval(
        DateTime.fromObject({
          day: 1,
          month: 4,
          year: 2025,
          hour: 18,
          minute: 30,
        }),
        DateTime.fromObject({
          day: 2,
          month: 4,
          year: 2025,
          hour: 18,
          minute: 30,
        }),
      ),
    ).toEqual([
      DateTime.fromObject({
        day: 2,
        month: 4,
        year: 2025,
        hour: 0,
        minute: 0,
      }),
    ] satisfies DateTime[]);
  });

  test('interval that transcends more than 2 days', () => {
    expect(
      computeStartOfDaysWithinInterval(
        DateTime.fromObject({
          day: 1,
          month: 4,
          year: 2025,
          hour: 18,
          minute: 30,
        }),
        DateTime.fromObject({
          day: 5,
          month: 4,
          year: 2025,
          hour: 4,
          minute: 30,
        }),
      ),
    ).toEqual([
      DateTime.fromObject({
        day: 2,
        month: 4,
        year: 2025,
        hour: 0,
        minute: 0,
      }),
      DateTime.fromObject({
        day: 3,
        month: 4,
        year: 2025,
        hour: 0,
        minute: 0,
      }),
      DateTime.fromObject({
        day: 4,
        month: 4,
        year: 2025,
        hour: 0,
        minute: 0,
      }),
      DateTime.fromObject({
        day: 5,
        month: 4,
        year: 2025,
        hour: 0,
        minute: 0,
      }),
    ] satisfies DateTime[]);
  });
});
