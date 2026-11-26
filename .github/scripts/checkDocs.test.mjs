import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { checkDocs, PLAN_HEADINGS } from './checkDocs.mjs';

const plan = (title) =>
  `# ${title}\n\n${PLAN_HEADINGS.map((heading) => `${heading}\n\nTask-specific content.`).join('\n\n')}\n`;

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
  writeDoc('docs/plans/template.md', plan('Template'));
  writeDoc('docs/plans/active/rollout.md', plan('Rollout'));
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
    `${plan('Rollout')}\n\`\`\`md\n## Example heading\n\`\`\`\n`,
  );

  expect(checkDocs(root)).toEqual([
    'README.md: missing repository link target missing.md',
  ]);
});

it('checks same-page and cross-file anchors, Unicode, inline code and duplicates', () => {
  writeDoc(
    'docs/guide.md',
    '# Guide\n\n## Café and `code`\n\n## Repeat\n\n## Repeat\n\n## Repeat-1\n',
  );
  writeDoc(
    'README.md',
    '# Project\n\n[same](#project) [code](docs/guide.md#caf%C3%A9-and-code) [duplicate](docs/guide.md#repeat-1) [collision](docs/guide.md#repeat-1-1)',
  );
  expect(checkDocs(root)).toEqual([]);
  writeDoc('README.md', '[broken](#missing) [other](docs/guide.md#missing)');
  expect(checkDocs(root)).toEqual([
    'README.md: missing Markdown heading anchor #missing',
    'README.md: missing Markdown heading anchor docs/guide.md#missing',
  ]);
});

it('rejects malformed encoding, missing plan index links and reordered sections', () => {
  writeDoc('README.md', '[bad](docs/guide.md#%zz)');
  writeDoc('docs/plans/README.md', '# Plans\n');
  writeDoc(
    'docs/plans/active/rollout.md',
    plan('Rollout').replace('## Purpose', '## Other'),
  );
  expect(checkDocs(root)).toEqual(
    expect.arrayContaining([
      'README.md: invalid encoding in link target docs/guide.md#%zz',
      'docs/plans/active/rollout.md: use the headings in docs/plans/template.md in order',
      'docs/plans/active/rollout.md: link this plan in docs/plans/README.md',
    ]),
  );
});

it('does not let template drift redefine the standard or accept empty sections', () => {
  writeDoc('docs/plans/template.md', '# Template\n\n## Progress\n');
  writeDoc(
    'docs/plans/active/rollout.md',
    plan('Rollout').replace(
      '## Concrete Steps\n\nTask-specific content.',
      '## Concrete Steps\n\n<!-- pending -->',
    ),
  );
  expect(checkDocs(root)).toEqual(
    expect.arrayContaining([
      'docs/plans/template.md: use the twelve standard plan headings in order',
      'docs/plans/active/rollout.md: empty section ## Concrete Steps',
    ]),
  );
});

it('allows historical completed layouts while checking their links and index', () => {
  writeDoc(
    'docs/plans/completed/old.md',
    '# Old\n\n## Original format\n\n[Guide](../../../README.md)',
  );
  writeDoc(
    'docs/plans/README.md',
    '[Current](active/rollout.md) [Old](completed/old.md)',
  );
  expect(checkDocs(root)).toEqual([]);
});
