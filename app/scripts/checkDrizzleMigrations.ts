import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, '../..');
const migrationsDir = join(projectRoot, 'drizzle');
const tempRoot = mkdtempSync(join(tmpdir(), 'mrtdown-drizzle-check-'));
const tempMigrationsDir = join(tempRoot, 'drizzle');

function readFileSnapshot(
  rootDir: string,
  currentDir = rootDir,
): Map<string, Buffer> {
  const snapshot = new Map<string, Buffer>();

  for (const entry of readdirSync(currentDir).sort()) {
    const path = join(currentDir, entry);
    const stat = statSync(path);

    if (stat.isDirectory()) {
      for (const [nestedPath, content] of readFileSnapshot(
        rootDir,
        path,
      ).entries()) {
        snapshot.set(nestedPath, content);
      }
      continue;
    }

    if (!stat.isFile()) {
      continue;
    }

    snapshot.set(
      resolve(path).slice(resolve(rootDir).length + 1),
      readFileSync(path),
    );
  }

  return snapshot;
}

function getChangedPaths(
  before: Map<string, Buffer>,
  after: Map<string, Buffer>,
): string[] {
  const paths = new Set([...before.keys(), ...after.keys()]);
  const changedPaths: string[] = [];

  for (const path of [...paths].sort()) {
    const beforeContent = before.get(path);
    const afterContent = after.get(path);

    if (
      beforeContent == null ||
      afterContent == null ||
      !beforeContent.equals(afterContent)
    ) {
      changedPaths.push(path);
    }
  }

  return changedPaths;
}

try {
  if (!existsSync(migrationsDir)) {
    throw new Error(`Missing Drizzle migrations directory: ${migrationsDir}`);
  }

  cpSync(migrationsDir, tempMigrationsDir, { recursive: true });
  const before = readFileSnapshot(tempMigrationsDir);

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
      'sqlite',
      '--schema',
      join(projectRoot, 'app/db/schema.ts'),
      '--out',
      './drizzle',
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
    const after = readFileSnapshot(tempMigrationsDir);
    const changedPaths = getChangedPaths(before, after);

    if (changedPaths.length > 0) {
      const generatedPaths = changedPaths.map((path) => `- ${path}`).join('\n');

      console.error(
        [
          'Drizzle schema changes are missing generated migrations.',
          'Run `npm run db:generate` and commit the generated files.',
          '',
          'Generated migration file changes detected:',
          generatedPaths,
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
