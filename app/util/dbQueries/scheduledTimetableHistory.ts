import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  readScheduledTimetableHistory,
  ScheduledTimetableImportRecordSchema,
} from '@mrtdown/fs';

type HistoryRow = {
  hash: string;
  predecessor: string | null;
  receipt: unknown;
  manifestBytes: Buffer;
};

export async function validateScheduledTimetableHistory(rows: HistoryRow[]) {
  // The shared validator currently accepts directories only. Adapt metadata,
  // never the old timetable bodies, and let it order and validate the lineage.
  const directory = await mkdtemp(join(tmpdir(), 'mrtdown-timetable-history-'));
  try {
    for (const row of rows) {
      const receipt = ScheduledTimetableImportRecordSchema.parse(row.receipt);
      if (
        receipt.manifestSha256 !== row.hash ||
        receipt.predecessorSha256 !== row.predecessor
      ) {
        throw new Error('Retained timetable receipt disagrees with its row');
      }
      const version = join(directory, receipt.manifestSha256);
      await mkdir(version);
      await writeFile(join(version, 'manifest.json'), row.manifestBytes);
      await writeFile(join(version, 'import.json'), JSON.stringify(receipt));
    }
    return await readScheduledTimetableHistory(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
