import { sql } from 'drizzle-orm';
import { text } from 'drizzle-orm/sqlite-core';

export const timestampColumns = {
  updated_at: text('updated_at')
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  created_at: text('created_at')
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
};

/**
 * Adapted from https://github.com/drizzle-team/drizzle-orm/discussions/1914#discussioncomment-9600199
 * @param myEnum
 * @returns
 */
export function enumToSqliteEnum<const T extends Record<string, string>>(
  myEnum: T,
): [T[keyof T], ...T[keyof T][]] {
  const values = Object.values(myEnum) as T[keyof T][];
  if (values.length === 0) {
    throw new Error('Cannot create a SQLite enum from an empty object');
  }
  return values as [T[keyof T], ...T[keyof T][]];
}

export function sqliteEnum<const Values extends readonly [string, ...string[]]>(
  _name: string,
  values: Values,
) {
  return (columnName?: string) => {
    if (columnName == null) {
      return text({ enum: values }).$type<Values[number]>();
    }

    return text(columnName, { enum: values }).$type<Values[number]>();
  };
}

export function jsonText<T>(name: string) {
  return text(name, { mode: 'json' }).$type<T>();
}
