import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  check,
  customType,
  jsonb,
  pgTable,
  text,
  unique,
} from 'drizzle-orm/pg-core';

const bytes = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => 'bytea',
});

export const scheduledTimetablesTable = pgTable(
  'scheduled_timetables',
  {
    manifest_sha256: text('manifest_sha256').primaryKey(),
    predecessor_sha256: text('predecessor_sha256').references(
      (): AnyPgColumn => scheduledTimetablesTable.manifest_sha256,
    ),
    import_record: jsonb('import_record').notNull(),
    pages_entry: jsonb('pages_entry').notNull(),
    manifest_bytes: bytes('manifest_bytes').notNull(),
    timetable_bytes: bytes('timetable_bytes').notNull(),
    notice_bytes: bytes('notice_bytes').notNull(),
    release_bytes: bytes('release_bytes').notNull(),
    mapping_draft_bytes: bytes('mapping_draft_bytes').notNull(),
    mapping_approval_bytes: bytes('mapping_approval_bytes').notNull(),
    release_review_bytes: bytes('release_review_bytes').notNull(),
  },
  (table) => [
    unique('scheduled_timetables_predecessor_unique')
      .on(table.predecessor_sha256)
      .nullsNotDistinct(),
    check(
      'scheduled_timetables_manifest_digest',
      sql`${table.manifest_sha256} ~ '^[a-f0-9]{64}$'`,
    ),
    check(
      'scheduled_timetables_receipt_manifest',
      sql`(${table.import_record}->>'manifestSha256') IS NOT DISTINCT FROM ${table.manifest_sha256}`,
    ),
    check(
      'scheduled_timetables_receipt_predecessor',
      sql`(${table.import_record}->>'predecessorSha256') IS NOT DISTINCT FROM ${table.predecessor_sha256}`,
    ),
  ],
);
