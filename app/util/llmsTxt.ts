import type {
  Link,
  ListItem,
  Paragraph,
  PhrasingContent,
  RootContent,
} from 'mdast';
import { markdownTable, serializeAgentMarkdown } from './agentMarkdown';

const DEFAULT_ROOT_URL = 'https://www.mrtdown.org';

interface LlmsTxtOptions {
  rootUrl?: string;
}

export function getLlmsTxt(options?: LlmsTxtOptions) {
  const rootUrl = options?.rootUrl ?? DEFAULT_ROOT_URL;
  const routeTable = markdownTable({
    headers: ['Content', 'Markdown URL', 'Human URL'],
    rows: [
      ['Current system status', '/index.md', '/'],
      ['Line profile', '/lines/{lineId}/index.md', '/lines/{lineId}'],
      [
        'Station profile',
        '/stations/{stationId}/index.md',
        '/stations/{stationId}',
      ],
      [
        'Operator profile',
        '/operators/{operatorId}/index.md',
        '/operators/{operatorId}',
      ],
      ['Issue profile', '/issues/{issueId}/index.md', '/issues/{issueId}'],
    ],
  });

  const content: RootContent[] = [
    {
      type: 'heading',
      depth: 1,
      children: [{ type: 'text', value: 'mrtdown' }],
    },
    paragraph([
      {
        type: 'text',
        value:
          'mrtdown provides current Singapore MRT and LRT service status, disruptions, planned maintenance, and canonical transit entity context.',
      },
    ]),
    {
      type: 'heading',
      depth: 2,
      children: [{ type: 'text', value: 'Primary Resources' }],
    },
    {
      type: 'list',
      ordered: false,
      spread: false,
      children: [
        listItem([
          link('Current public status page', '/', rootUrl),
          {
            type: 'text',
            value: ': human-facing overview of live service status.',
          },
        ]),
        listItem([
          link('Issue history', '/history', rootUrl),
          {
            type: 'text',
            value: ': human-facing archive of past service issues.',
          },
        ]),
        listItem([
          link('System map', '/system-map', rootUrl),
          {
            type: 'text',
            value: ': human-facing network map.',
          },
        ]),
        listItem([
          link('Sitemap', '/sitemap.xml', rootUrl),
          {
            type: 'text',
            value:
              ': discover current line, station, operator, and issue identifiers.',
          },
        ]),
      ],
    },
    {
      type: 'heading',
      depth: 2,
      children: [{ type: 'text', value: 'Markdown Routes' }],
    },
    paragraph([
      {
        type: 'text',
        value:
          'The first Markdown pass is en-SG only. Replace placeholders with identifiers from the sitemap or human pages.',
      },
    ]),
  ];

  if (routeTable != null) {
    content.push(routeTable);
  }

  content.push(
    {
      type: 'heading',
      depth: 2,
      children: [{ type: 'text', value: 'Notes For Agents' }],
    },
    {
      type: 'list',
      ordered: false,
      spread: false,
      children: [
        listItem([
          {
            type: 'text',
            value:
              'Prefer explicit Markdown URLs when available; they are generated from read-model data, not converted from rendered HTML.',
          },
        ]),
        listItem([
          {
            type: 'text',
            value:
              'Crowd-sourced report signals may appear where the matching public page includes them.',
          },
        ]),
        listItem([
          {
            type: 'text',
            value:
              'Do not treat this file as a full sitemap; it is a curated entry point for high-value agent routes.',
          },
        ]),
      ],
    },
  );

  return serializeAgentMarkdown(content);
}

function paragraph(children: PhrasingContent[]): Paragraph {
  return {
    type: 'paragraph',
    children,
  };
}

function listItem(children: PhrasingContent[]): ListItem {
  return {
    type: 'listItem',
    spread: false,
    children: [paragraph(children)],
  };
}

function link(label: string, path: string, rootUrl: string): Link {
  return {
    type: 'link',
    url: new URL(path, rootUrl).toString(),
    children: [{ type: 'text', value: label }],
  };
}
