import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

type Journal = {
  entries: Array<{
    idx: number;
    tag: string;
  }>;
};

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, '../..');
const migrationsDir = join(projectRoot, 'drizzle');
const tempRoot = mkdtempSync(join(tmpdir(), 'mrtdown-drizzle-check-'));
const tempMigrationsDir = join(tempRoot, 'drizzle');

function readJournal(migrationsPath: string): Journal {
  return JSON.parse(
    readFileSync(join(migrationsPath, 'meta', '_journal.json'), 'utf8'),
  ) as Journal;
}

try {
  if (!existsSync(migrationsDir)) {
    throw new Error(`Missing Drizzle migrations directory: ${migrationsDir}`);
  }

  const before = readJournal(migrationsDir);
  cpSync(migrationsDir, tempMigrationsDir, { recursive: true });

  const drizzleKitBin = join(
    projectRoot,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'drizzle-kit.cmd' : 'drizzle-kit',
  );

  const result = spawnSync(
    drizzleKitBin,
    [
      'generate',
      '--dialect',
      'postgresql',
      '--schema',
      join(projectRoot, 'app/db/schema.ts'),
      '--out',
      './drizzle',
      '--prefix',
      'index',
    ],
    {
      cwd: tempRoot,
      encoding: 'utf8',
    },
  );

  if (result.error != null) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.stdout.write(result.stdout);
    process.stderr.write(result.stderr);
    process.exitCode = result.status ?? 1;
  } else {
    const after = readJournal(tempMigrationsDir);
    const generatedEntries = after.entries.slice(before.entries.length);

    if (generatedEntries.length > 0) {
      const generatedTags = generatedEntries
        .map((entry) => `- ${entry.tag}`)
        .join('\n');

      console.error(
        [
          'Drizzle schema changes are missing generated migrations.',
          'Run `npm run db:generate` and commit the generated files.',
          '',
          'Generated migration(s) detected:',
          generatedTags,
        ].join('\n'),
      );
      process.exitCode = 1;
    } else {
      console.log('Drizzle migrations are up to date.');
    }
  }
} finally {
  if (process.env.DRIZZLE_MIGRATION_CHECK_KEEP_TMP === '1') {
    console.log(`Keeping temporary migration check directory: ${tempRoot}`);
  } else {
    rmSync(tempRoot, { force: true, recursive: true });
  }
}
