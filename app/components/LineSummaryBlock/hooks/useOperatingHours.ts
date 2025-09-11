import { DateTime } from 'luxon';
import { useMemo } from 'react';
import type { Line } from '~/client';
import { assert } from '~/util/assert';

export function useOperatingHours(
  line: Line,
  dateTime: DateTime,
  dayType: 'weekday' | 'weekend' | 'public_holiday',
) {
  return useMemo(() => {
    const { weekdays, weekends } = line.operatingHours;

    let startTime = weekdays.start;
    let endTime = weekdays.end;

    switch (dayType) {
      case 'public_holiday':
      case 'weekend': {
        startTime = weekends.start;
        endTime = weekends.end;
        break;
      }
    }

    const start = DateTime.fromISO(`${dateTime.toISODate()}T${startTime}`, { zone: 'Asia/Singapore'});
    assert(start.isValid);
    let end = DateTime.fromISO(`${dateTime.toISODate()}T${endTime}`, { zone: 'Asia/Singapore'});
    assert(end.isValid);
    if (end < start) {
      // If the end time is before the start time, it means the end time is on the next day
      end = end.plus({ days: 1 });
    }

    return {
      start,
      end,
    };
  }, [dateTime, line.operatingHours, dayType]);
}
