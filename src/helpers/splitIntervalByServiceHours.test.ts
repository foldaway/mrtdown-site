import { describe, expect, test } from 'vitest';
import { DateTime, Interval } from 'luxon';
import { splitIntervalByServiceHours } from './splitIntervalByServiceHours';

describe('splitIntervalByServiceHours', () => {
  test('single day, within service hours', () => {
    expect(
      splitIntervalByServiceHours(
        Interval.fromDateTimes(
          DateTime.fromObject({
            day: 1,
            month: 4,
            year: 2025,
            hour: 8,
            minute: 0,
          }),
          DateTime.fromObject({
            day: 1,
            month: 4,
            year: 2025,
            hour: 12,
            minute: 30,
          }),
        ),
      ),
    ).toEqual([
      Interval.fromDateTimes(
        DateTime.fromObject({
          day: 1,
          month: 4,
          year: 2025,
          hour: 8,
          minute: 0,
        }),
        DateTime.fromObject({
          day: 1,
          month: 4,
          year: 2025,
          hour: 12,
          minute: 30,
        }),
      ),
    ] satisfies Interval[]);
  });
  describe('transcends service hour boundaries', () => {
    test('single day, starts before service hours', () => {
      expect(
        splitIntervalByServiceHours(
          Interval.fromDateTimes(
            DateTime.fromObject({
              day: 1,
              month: 4,
              year: 2025,
              hour: 5,
              minute: 0,
            }),
            DateTime.fromObject({
              day: 1,
              month: 4,
              year: 2025,
              hour: 6,
              minute: 0,
            }),
          ),
        ),
      ).toEqual([
        Interval.fromDateTimes(
          DateTime.fromObject({
            day: 1,
            month: 4,
            year: 2025,
            hour: 5,
            minute: 30,
          }),
          DateTime.fromObject({
            day: 1,
            month: 4,
            year: 2025,
            hour: 6,
            minute: 0,
          }),
        ),
      ] satisfies Interval[]);
    });
    test('single day, ends after service hours', () => {
      expect(
        splitIntervalByServiceHours(
          Interval.fromDateTimes(
            DateTime.fromObject({
              day: 1,
              month: 4,
              year: 2025,
              hour: 18,
              minute: 0,
            }),
            DateTime.fromObject({
              day: 2,
              month: 4,
              year: 2025,
              hour: 1,
              minute: 0,
            }),
          ),
        ),
      ).toEqual([
        Interval.fromDateTimes(
          DateTime.fromObject({
            day: 1,
            month: 4,
            year: 2025,
            hour: 18,
            minute: 0,
          }),
          DateTime.fromObject({
            day: 2,
            month: 4,
            year: 2025,
            hour: 0,
            minute: 0,
          }),
        ),
      ] satisfies Interval[]);
    });
    test('multiple days, transcends multiple service hours/non services hour ranges', () => {
      expect(
        splitIntervalByServiceHours(
          Interval.fromDateTimes(
            DateTime.fromObject({
              day: 1,
              month: 4,
              year: 2025,
              hour: 18,
              minute: 0,
            }),
            DateTime.fromObject({
              day: 2,
              month: 4,
              year: 2025,
              hour: 18,
              minute: 0,
            }),
          ),
        ),
      ).toEqual([
        Interval.fromDateTimes(
          DateTime.fromObject({
            day: 1,
            month: 4,
            year: 2025,
            hour: 18,
            minute: 0,
          }),
          DateTime.fromObject({
            day: 2,
            month: 4,
            year: 2025,
            hour: 0,
            minute: 0,
          }),
        ),
        Interval.fromDateTimes(
          DateTime.fromObject({
            day: 2,
            month: 4,
            year: 2025,
            hour: 5,
            minute: 30,
          }),
          DateTime.fromObject({
            day: 2,
            month: 4,
            year: 2025,
            hour: 18,
            minute: 0,
          }),
        ),
      ] satisfies Interval[]);
    });
  });
  test('outside service hours', () => {
    expect(
      splitIntervalByServiceHours(
        Interval.fromDateTimes(
          DateTime.fromObject({
            day: 1,
            month: 4,
            year: 2025,
            hour: 3,
            minute: 0,
          }),
          DateTime.fromObject({
            day: 1,
            month: 4,
            year: 2025,
            hour: 4,
            minute: 30,
          }),
        ),
      ),
    ).toEqual([] satisfies Interval[]);
  });
});
