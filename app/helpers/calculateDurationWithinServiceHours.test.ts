import { describe, expect, test } from 'vitest';
import { calculateDurationWithinServiceHours } from './calculateDurationWithinServiceHours';
import { DateTime } from 'luxon';

describe('calculateDurationWithinServiceHours', () => {
  test('single day, within service hours', () => {
    expect(
      calculateDurationWithinServiceHours(
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
      ).as('hours'),
    ).toEqual(4.5);
  });
  describe('transcends service hour boundaries', () => {
    test('single day, starts before service hours', () => {
      expect(
        calculateDurationWithinServiceHours(
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
        ).as('hours'),
      ).toEqual(0.5);
    });
    test('single day, ends after service hours', () => {
      expect(
        calculateDurationWithinServiceHours(
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
        ).as('hours'),
      ).toEqual(6);
    });
    test('multiple days, transcends multiple service hours/non services hour ranges', () => {
      expect(
        calculateDurationWithinServiceHours(
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
        ).as('hours'),
      ).toEqual(18.5);
    });
  });
  test('outside service hours', () => {
    expect(
      calculateDurationWithinServiceHours(
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
      ).as('hours'),
    ).toEqual(0);
  });
});
