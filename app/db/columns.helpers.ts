import { timestamp } from 'drizzle-orm/pg-core';

export const timestampColumns = {
  updated_at: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  created_at: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
};

/**
 * Adapted from https://github.com/drizzle-team/drizzle-orm/discussions/1914#discussioncomment-9600199
 * @param myEnum
 * @returns
 */
export function enumToPgEnum<const T extends Record<string, string>>(
  myEnum: T,
): [T[keyof T], ...T[keyof T][]] {
  const values = Object.values(myEnum) as T[keyof T][];
  if (values.length === 0) {
    throw new Error('Cannot create a Postgres enum from an empty object');
  }
  return values as [T[keyof T], ...T[keyof T][]];
}
