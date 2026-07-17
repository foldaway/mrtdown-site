import { DateTime } from 'luxon';

export const SG_TIMEZONE = 'Asia/Singapore';

const dateTimeCache = new Map<string, DateTime>();

export function nowSg() {
  return DateTime.now().setZone(SG_TIMEZONE);
}

export function parseDateTime(value: string) {
  const cached = dateTimeCache.get(value);
  if (cached != null) {
    return cached;
  }

  let parsed: DateTime;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    parsed = DateTime.fromISO(value, { zone: SG_TIMEZONE });
  } else {
    const iso = DateTime.fromISO(value, { setZone: true });
    if (iso.isValid) {
      parsed = iso.setZone(SG_TIMEZONE);
    } else {
      const sqlDateTime = DateTime.fromSQL(value, { setZone: true });
      parsed = sqlDateTime.isValid
        ? sqlDateTime.setZone(SG_TIMEZONE)
        : DateTime.fromJSDate(new Date(value)).setZone(SG_TIMEZONE);
    }
  }

  dateTimeCache.set(value, parsed);
  return parsed;
}

export function isoDate(value: DateTime) {
  const date = value.toISODate();
  if (date == null) {
    throw new Error(`Invalid DateTime value: ${value.invalidReason ?? value}`);
  }
  return date;
}

export function isoDateTime(value: DateTime) {
  const dateTime = value.toISO();
  if (dateTime == null) {
    throw new Error(`Invalid DateTime value: ${value.invalidReason ?? value}`);
  }
  return dateTime;
}
