import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { toMarkdown } from 'mdast-util-to-markdown';
import { visit } from 'unist-util-visit';

function headings(tree) {
  return tree.children
    .filter((node) => node.type === 'heading' && node.depth === 2)
    .map((node) => toMarkdown(node).trim());
}

function linkTargets(tree) {
  const definitions = new Map();
  visit(tree, 'definition', ({ identifier, url }) => {
    if (!definitions.has(identifier)) definitions.set(identifier, url);
  });

  const targets = [];
  visit(tree, ['link', 'image', 'linkReference', 'imageReference'], (node) => {
    const target = 'url' in node ? node.url : definitions.get(node.identifier);
    if (target !== undefined) {
      targets.push({
        target,
        isLink: node.type === 'link' || node.type === 'linkReference',
      });
    }
  });
  return targets;
}

export function checkDocs(root) {
  const docsRoot = resolve(root, 'docs');
  const planRoot = resolve(docsRoot, 'plans');
  const templatePath = resolve(planRoot, 'template.md');
  const indexPath = resolve(planRoot, 'README.md');
  const docs = [
    resolve(root, 'AGENTS.md'),
    resolve(root, 'README.md'),
    ...readdirSync(docsRoot, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
      .map((entry) => resolve(entry.parentPath, entry.name)),
  ];

  const requiredHeadings = existsSync(templatePath)
    ? headings(fromMarkdown(readFileSync(templatePath, 'utf8')))
    : [];
  const errors = [];
  const indexedPlans = new Set();

  if (requiredHeadings.length === 0) {
    errors.push('docs/plans/template.md: expected execution plan headings');
  }

  for (const path of docs) {
    const doc = relative(root, path);
    const tree = fromMarkdown(readFileSync(path, 'utf8'));

    if (
      relative(planRoot, path).startsWith(`active${sep}`) &&
      JSON.stringify(headings(tree)) !== JSON.stringify(requiredHeadings)
    ) {
      errors.push(
        `${doc}: use the headings in docs/plans/template.md in order`,
      );
    }

    for (const { target, isLink } of linkTargets(tree)) {
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
        continue;
      }
      if (path === indexPath && isLink) indexedPlans.add(linkedPath);
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

  return errors;
}

if (import.meta.main) {
  const errors = checkDocs(resolve(import.meta.dirname, '../..'));
  if (errors.length > 0) {
    console.error(`Documentation check failed:\n- ${errors.join('\n- ')}`);
    process.exitCode = 1;
  } else {
    console.log('Documentation links, plan index, and active plans are valid.');
  }
}
