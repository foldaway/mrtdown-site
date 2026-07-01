import { DateTime } from 'luxon';
import type { Line, LineSummaryDayType } from '~/types';
import { isoDate, nowSg, parseDateTime } from './temporal';

export function lineDayType(
  date: DateTime,
  publicHolidaySet: Set<string>,
): LineSummaryDayType {
  if (publicHolidaySet.has(isoDate(date))) {
    return 'public_holiday';
  }
  return date.weekday >= 6 ? 'weekend' : 'weekday';
}

export function serviceWindowForDate(
  line: Line,
  date: DateTime,
  publicHolidaySet: Set<string>,
) {
  const dayType = lineDayType(date, publicHolidaySet);
  const hours =
    dayType === 'weekday'
      ? line.operatingHours.weekdays
      : line.operatingHours.weekends;

  const [startHour, startMinute] = hours.start.split(':').map(Number);
  const [endHour, endMinute] = hours.end.split(':').map(Number);

  const windowStart = date.startOf('day').set({
    hour: startHour,
    minute: startMinute,
  });
  let windowEnd = date.startOf('day').set({
    hour: endHour,
    minute: endMinute,
  });
  if (windowEnd <= windowStart) {
    windowEnd = windowEnd.plus({ day: 1 });
  }

  return {
    start: windowStart,
    end: windowEnd,
    seconds: Math.max(0, windowEnd.diff(windowStart, 'seconds').seconds),
  };
}

export function serviceWindowContains(
  serviceWindow: ReturnType<typeof serviceWindowForDate>,
  date: DateTime,
) {
  return date >= serviceWindow.start && date <= serviceWindow.end;
}

export function serviceWindowIsAfterLineStart(
  line: Line,
  serviceWindow: ReturnType<typeof serviceWindowForDate>,
) {
  if (line.startedAt == null) {
    return true;
  }

  return serviceWindow.start.startOf('day') >= parseDateTime(line.startedAt);
}

export function serviceWindowAfterLineStart(
  line: Line,
  serviceWindow: ReturnType<typeof serviceWindowForDate>,
) {
  const windowStart =
    line.startedAt == null
      ? serviceWindow.start
      : DateTime.max(serviceWindow.start, parseDateTime(line.startedAt));
  const seconds = Math.max(
    0,
    serviceWindow.end.diff(windowStart, 'seconds').seconds,
  );
  return {
    start: windowStart,
    end: serviceWindow.end,
    seconds,
  };
}

export function isLineFuture(line: Line, referenceNow = nowSg()) {
  if (line.startedAt == null) {
    return false;
  }
  return parseDateTime(line.startedAt) > referenceNow;
}

export function isLineOperatingNow(
  line: Line,
  publicHolidaySet: Set<string>,
  referenceNow = nowSg(),
) {
  if (isLineFuture(line, referenceNow)) {
    return false;
  }

  if (line.startedAt != null) {
    const start = parseDateTime(line.startedAt);
    if (referenceNow < start) {
      return false;
    }
  }

  const window = serviceWindowForDate(line, referenceNow, publicHolidaySet);
  if (serviceWindowContains(window, referenceNow)) {
    return true;
  }

  const previousWindow = serviceWindowForDate(
    line,
    referenceNow.minus({ day: 1 }),
    publicHolidaySet,
  );
  return (
    serviceWindowIsAfterLineStart(line, previousWindow) &&
    serviceWindowContains(previousWindow, referenceNow)
  );
}
