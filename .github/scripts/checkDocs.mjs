import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { decode } from 'html-entities';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { toMarkdown } from 'mdast-util-to-markdown';
import { visit } from 'unist-util-visit';

export const PLAN_HEADINGS = [
  'Purpose',
  'Progress',
  'Surprises & Discoveries',
  'Decision Log',
  'Outcomes & Retrospective',
  'Context and Orientation',
  'Plan of Work',
  'Concrete Steps',
  'Validation and Acceptance',
  'Idempotence and Recovery',
  'Artifacts and Notes',
  'Interfaces and Dependencies',
].map((heading) => `## ${heading}`);

function headings(tree) {
  return tree.children
    .filter((node) => node.type === 'heading' && node.depth === 2)
    .map((node) => toMarkdown(node).trim());
}

function withoutHtmlComments(html) {
  return html.replace(/<!--[\s\S]*?(?:-->|$)/g, '');
}

// GitHub-style heading IDs, including duplicate headings and inline code labels.
function anchors(tree) {
  const ids = new Set();
  visit(tree, 'heading', (node) => {
    let label = '';
    visit(node, ['text', 'inlineCode'], (child) => {
      label += child.value;
    });
    const slug = label
      .toLowerCase()
      .replace(/[^\p{L}\p{M}\p{N}_\-\s]/gu, '')
      .replace(/ /g, '-');
    let id = slug;
    let suffix = 0;
    while (ids.has(id)) id = `${slug}-${++suffix}`;
    ids.add(id);
  });

  // Explicit targets do not participate in generated heading suffixes.
  const explicit = new Set();
  visit(tree, 'html', ({ value }) => {
    const tags = withoutHtmlComments(value).matchAll(
      /<([a-z][\w:-]*)\b((?:"[^"]*"|'[^']*'|[^'">])*)>/gi,
    );
    for (const [, tag, attributes] of tags) {
      for (const [
        ,
        name,
        doubleQuoted,
        singleQuoted,
        unquoted,
      ] of attributes.matchAll(
        /([^\s=/'">]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g,
      )) {
        if (
          name.toLowerCase() === 'id' ||
          (tag.toLowerCase() === 'a' && name.toLowerCase() === 'name')
        ) {
          const target = doubleQuoted ?? singleQuoted ?? unquoted;
          if (target) explicit.add(decode(target));
        }
      }
    }
  });
  return new Set([...ids, ...explicit]);
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

  const trees = new Map(
    docs.map((path) => [path, fromMarkdown(readFileSync(path, 'utf8'))]),
  );
  const headingAnchors = new Map(
    [...trees].map(([path, tree]) => [path, anchors(tree)]),
  );
  const errors = [];
  const indexedPlans = new Set();

  if (
    JSON.stringify(
      trees.has(templatePath) ? headings(trees.get(templatePath)) : [],
    ) !== JSON.stringify(PLAN_HEADINGS)
  ) {
    errors.push(
      'docs/plans/template.md: use the twelve standard plan headings in order',
    );
  }

  for (const path of docs) {
    const doc = relative(root, path);
    const tree = trees.get(path);

    if (
      relative(planRoot, path).startsWith(`active${sep}`) &&
      JSON.stringify(headings(tree)) !== JSON.stringify(PLAN_HEADINGS)
    ) {
      errors.push(
        `${doc}: use the headings in docs/plans/template.md in order`,
      );
    }

    if (
      path === templatePath ||
      relative(planRoot, path).startsWith(`active${sep}`)
    ) {
      const sections = tree.children;
      for (let i = 0; i < sections.length; i++) {
        const node = sections[i];
        if (node.type !== 'heading' || node.depth !== 2) continue;
        let end = i + 1;
        while (
          end < sections.length &&
          !(sections[end].type === 'heading' && sections[end].depth === 2)
        )
          end++;
        if (
          !sections
            .slice(i + 1, end)
            .some((child) =>
              child.type === 'html'
                ? withoutHtmlComments(child.value).trim() !== ''
                : child.type !== 'heading',
            )
        ) {
          errors.push(`${doc}: empty section ${toMarkdown(node).trim()}`);
        }
      }
    }

    for (const { target, isLink } of linkTargets(tree)) {
      if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(target)) continue;

      let linkPath;
      let fragment;
      try {
        linkPath = decodeURIComponent(target.split(/[?#]/, 1)[0]);
        fragment = decodeURIComponent(target.split('#').slice(1).join('#'));
      } catch {
        errors.push(`${doc}: invalid encoding in link target ${target}`);
        continue;
      }
      const linkedPath = linkPath ? resolve(dirname(path), linkPath) : path;
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
      if (fragment && linkedPath.endsWith('.md')) {
        const ids =
          headingAnchors.get(linkedPath) ??
          anchors(fromMarkdown(readFileSync(linkedPath, 'utf8')));
        if (!ids.has(fragment))
          errors.push(`${doc}: missing Markdown heading anchor ${target}`);
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
    console.log(
      'Documentation links, heading anchors, plan index, and active plans are valid.',
    );
  }
}
