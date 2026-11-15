import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { checkDocs } from './checkDocs.mjs';

let root;

function writeDoc(path, contents) {
  const file = join(root, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, contents);
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'mrtdown-check-docs-'));
  writeDoc('AGENTS.md', '# Agents\n');
  writeDoc('README.md', '# Project\n');
  writeDoc('docs/plans/template.md', '# Template\n\n## Progress\n');
  writeDoc('docs/plans/active/rollout.md', '# Rollout\n\n## Progress\n');
  writeDoc('docs/plans/README.md', '- [Rollout](active/rollout.md)\n');
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

it('counts a reference-style plan link using the first matching definition', () => {
  writeDoc(
    'docs/plans/README.md',
    '- [Rollout][Release   Plan]\n\n' +
      '[release plan]: active/rollout.md#progress\n' +
      '[RELEASE PLAN]: ignored.md\n',
  );

  expect(checkDocs(root)).toEqual([]);
});

it('checks relative targets of reference links and inline links', () => {
  writeDoc(
    'README.md',
    '[Missing guide][] and [a broken inline link](missing-inline.md).\n\n' +
      '[Missing guide]: <missing guide.md>\n',
  );

  expect(checkDocs(root)).toEqual([
    'README.md: missing repository link target missing guide.md',
    'README.md: missing repository link target missing-inline.md',
  ]);
});

it('ignores Markdown examples in code and checks links with code in their labels', () => {
  writeDoc(
    'README.md',
    'Use `[literal syntax](ignored.md)` and [`missing.md`](missing.md).\n\n' +
      '```md\n[fenced example](also-ignored.md)\n```\n',
  );
  writeDoc(
    'docs/plans/active/rollout.md',
    '# Rollout\n\n## Progress\n\n```md\n## Example heading\n```\n',
  );

  expect(checkDocs(root)).toEqual([
    'README.md: missing repository link target missing.md',
  ]);
});
