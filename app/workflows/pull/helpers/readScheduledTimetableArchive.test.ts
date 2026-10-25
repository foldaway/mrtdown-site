import { hashBytes } from '@mrtdown/fs';
import { Zip, ZipPassThrough, zipSync } from 'fflate';
import { describe, expect, it, vi } from 'vitest';
import { ZipStore } from '~/helpers/ZipStore';
import { readScheduledTimetableArchive } from './readScheduledTimetableArchive';
import { scheduledTimetableArchiveFixture } from './scheduledTimetableArchive.fixture';

const fixture = scheduledTimetableArchiveFixture();
const rootManifest = { scheduledTimetable: fixture.entry };

function archiveFiles() {
  return Object.fromEntries(
    Object.entries(fixture.files).map(([name, bytes]) => [
      `data/scheduled-timetable/${name}`,
      bytes,
    ]),
  );
}

function store(files = archiveFiles()) {
  return new ZipStore(Buffer.from(zipSync(files)));
}

describe('readScheduledTimetableArchive', () => {
  it('ignores an archive-advertised timetable when the root entry is absent', async () => {
    const zip = store({
      ...archiveFiles(),
      'data/manifest.json': Buffer.from(JSON.stringify(rootManifest)),
    });
    const read = vi.spyOn(zip, 'readBytes');
    expect(await readScheduledTimetableArchive({}, zip)).toBeNull();
    expect(read).not.toHaveBeenCalled();
    // Existing text reads still work after the GTFS-free path.
    expect(zip.readJson('manifest.json')).toEqual(rootManifest);
  });

  it('verifies and preserves all seven original files with one exact read each', async () => {
    const zip = store();
    const read = vi.spyOn(zip, 'readBytes');
    const result = await readScheduledTimetableArchive(rootManifest, zip);
    expect(result?.entry).toEqual(fixture.entry);
    expect(Object.keys(result?.files ?? {}).sort()).toEqual(
      Object.keys(fixture.files).sort(),
    );
    for (const name of Object.keys(fixture.files) as Array<
      keyof typeof fixture.files
    >) {
      expect(Buffer.from(result?.files[name] ?? [])).toEqual(
        fixture.files[name],
      );
    }
    expect(read.mock.calls.map(([path]) => path).sort()).toEqual(
      Object.keys(fixture.files)
        .map((name) => `scheduled-timetable/${name}`)
        .sort(),
    );
    // Pretty-printed JSON, trailing newlines and NOTICE bytes survive unchanged.
    // Binary reads bypass the cache: a second read gets a fresh inflation.
    const path = 'scheduled-timetable/mapping-draft.json';
    const bytes = zip.readBytes(path);
    bytes.fill(0);
    expect(Buffer.from(zip.readBytes(path))).toEqual(
      fixture.files['mapping-draft.json'],
    );
  });

  it('rejects ambiguous duplicate archive entries', async () => {
    const chunks: Uint8Array[] = [];
    const zip = new Zip((error, bytes) => {
      if (error) {
        throw error;
      }
      chunks.push(bytes);
    });
    for (let copy = 0; copy < 2; copy++) {
      const file = new ZipPassThrough('data/scheduled-timetable/manifest.json');
      zip.add(file);
      file.push(fixture.files['manifest.json'], true);
    }
    zip.end();
    await expect(
      readScheduledTimetableArchive(
        rootManifest,
        new ZipStore(Buffer.concat(chunks)),
      ),
    ).rejects.toThrow('Duplicate archive entry');
  });

  it('rejects every missing or damaged file and normalized path substitutes', async () => {
    for (const name of Object.keys(fixture.files)) {
      const path = `data/scheduled-timetable/${name}`;
      const files = archiveFiles();
      delete files[path];
      await expect(
        readScheduledTimetableArchive(rootManifest, store(files)),
      ).rejects.toThrow('ENOENT');
      files[path] = new Uint8Array([0xff]);
      await expect(
        readScheduledTimetableArchive(rootManifest, store(files)),
      ).rejects.toThrow();
      delete files[path];
      files[`data/scheduled-timetable/./${name}`] =
        fixture.files[name as keyof typeof fixture.files];
      await expect(
        readScheduledTimetableArchive(rootManifest, store(files)),
      ).rejects.toThrow('ENOENT');
    }
  });

  it('rejects root identity mismatches and unbound reviews in a hash-matching report', async () => {
    await expect(
      readScheduledTimetableArchive(
        {
          scheduledTimetable: {
            ...fixture.entry,
            capture: { ...fixture.entry.capture, attribution: 'Other source' },
          },
        },
        store(),
      ),
    ).rejects.toThrow('capture');
    const files = archiveFiles();
    const path = 'data/scheduled-timetable/release.json';
    const report = JSON.parse(new TextDecoder().decode(files[path]));
    report.release.reviewSha256 = 'a'.repeat(64);
    files[path] = Buffer.from(JSON.stringify(report));
    await expect(
      readScheduledTimetableArchive(
        {
          scheduledTimetable: {
            ...fixture.entry,
            releaseSha256: hashBytes(files[path]),
          },
        },
        store(files),
      ),
    ).rejects.toThrow('release review');
  });
});
