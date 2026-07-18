import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const APP_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const COMPLETE_DATASET_IMPORT = /from\s+['"][^'"]*dbQueries\/dataset['"]/;

function findSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return findSourceFiles(path);
    }
    return /\.(?:ts|tsx)$/.test(entry.name) && !entry.name.includes('.test.')
      ? [path]
      : [];
  });
}

function findCompleteDatasetImports(paths: readonly string[]) {
  return paths.filter((path) =>
    COMPLETE_DATASET_IMPORT.test(readFileSync(path, 'utf8')),
  );
}

describe('complete dataset boundary', () => {
  it('keeps public server functions from importing the complete dataset', () => {
    const publicServerFunctions = findSourceFiles(
      join(APP_ROOT, 'util'),
    ).filter((path) => path.endsWith('.functions.ts'));

    expect(findCompleteDatasetImports(publicServerFunctions)).toEqual([]);
  });

  it('keeps public route handlers from importing the complete dataset', () => {
    const publicRoutes = findSourceFiles(join(APP_ROOT, 'routes')).filter(
      (path) => !path.includes(`${join(APP_ROOT, 'routes')}/internal.`),
    );

    expect(findCompleteDatasetImports(publicRoutes)).toEqual([]);
  });
});
