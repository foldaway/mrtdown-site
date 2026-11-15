import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const docsRoot = resolve(root, 'docs');
const planRoot = resolve(docsRoot, 'plans');
const templatePath = resolve(planRoot, 'template.md');
const indexPath = resolve(planRoot, 'README.md');
const linkPattern = /\[[^\]\n]+\]\(\s*(?:<([^>\n]+)>|([^\s)]+))/g;

function withoutCodeFences(markdown) {
  let fence;
  return markdown
    .split(/\r?\n/)
    .filter((line) => {
      const marker = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
      if (fence) {
        if (marker?.[1].startsWith(fence) && !marker[2].trim())
          fence = undefined;
        return false;
      }
      if (!marker) return true;
      fence = marker[1];
      return false;
    })
    .join('\n');
}

function headings(markdown) {
  return [...markdown.matchAll(/^ {0,3}##[ \t]+(.+?) *$/gm)].map(
    ([, heading]) => heading,
  );
}

const docs = [
  resolve(root, 'AGENTS.md'),
  resolve(root, 'README.md'),
  ...readdirSync(docsRoot, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => resolve(entry.parentPath, entry.name)),
];

const template = existsSync(templatePath)
  ? withoutCodeFences(readFileSync(templatePath, 'utf8'))
  : '';
const requiredHeadings = headings(template);
const errors = [];
const indexedPlans = new Set();

if (requiredHeadings.length === 0) {
  errors.push('docs/plans/template.md: expected execution plan headings');
}

for (const path of docs) {
  const doc = relative(root, path);
  const markdown = withoutCodeFences(readFileSync(path, 'utf8'));

  if (
    relative(planRoot, path).startsWith(`active${sep}`) &&
    JSON.stringify(headings(markdown)) !== JSON.stringify(requiredHeadings)
  ) {
    errors.push(`${doc}: use the headings in docs/plans/template.md in order`);
  }

  for (const [, angledTarget, bareTarget] of markdown.matchAll(linkPattern)) {
    const target = angledTarget ?? bareTarget;
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(target)) continue;

    let linkPath;
    try {
      linkPath = decodeURIComponent(target.split(/[?#]/, 1)[0]);
    } catch {
      errors.push(`${doc}: invalid encoding in link target ${target}`);
      continue;
    }
    const linkedPath = resolve(dirname(path), linkPath);
    const fromRoot = relative(root, linkedPath);
    if (
      isAbsolute(fromRoot) ||
      fromRoot === '..' ||
      fromRoot.startsWith(`..${sep}`) ||
      !existsSync(linkedPath)
    ) {
      errors.push(`${doc}: missing repository link target ${target}`);
    }
    if (path === indexPath) indexedPlans.add(linkedPath);
  }
}

for (const path of docs) {
  const [folder] = relative(planRoot, path).split(sep);
  if (
    (folder === 'active' || folder === 'completed') &&
    !indexedPlans.has(path)
  ) {
    errors.push(
      `${relative(root, path)}: link this plan in docs/plans/README.md`,
    );
  }
}

if (errors.length > 0) {
  console.error(`Documentation check failed:\n- ${errors.join('\n- ')}`);
  process.exitCode = 1;
} else {
  console.log('Documentation links, plan index, and active plans are valid.');
}
