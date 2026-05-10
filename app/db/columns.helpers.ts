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
export function enumToPgEnum<T extends Record<string, any>>(
  myEnum: T,
): [T[keyof T], ...T[keyof T][]] {
  return Object.values(myEnum).map((value: any) => `${value}`) as any;
}
