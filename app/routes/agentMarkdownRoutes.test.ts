import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HOME_OVERVIEW_INITIAL_DATE_COUNT } from '~/constants';
import { Route as IndexMarkdownRoute } from './index[.]md';
import { Route as IssueMarkdownRoute } from './issues/$issueId/index[.]md';
import { Route as LineMarkdownRoute } from './lines/$lineId/index[.]md';
import { Route as LlmsTxtRoute } from './llms[.]txt';
import { Route as OperatorMarkdownRoute } from './operators/$operatorId/index[.]md';
import { Route as StationMarkdownRoute } from './stations/$stationId/index[.]md';

const mocks = vi.hoisted(() => ({
  getIssueFn: vi.fn(),
  getIssueMarkdown: vi.fn(),
  getLineMarkdown: vi.fn(),
  getLineProfileFn: vi.fn(),
  getLlmsTxt: vi.fn(),
  getOperatorMarkdown: vi.fn(),
  getOperatorProfileFn: vi.fn(),
  getOverviewFn: vi.fn(),
  getOverviewMarkdown: vi.fn(),
  getStationMarkdown: vi.fn(),
  getStationProfileFn: vi.fn(),
}));

const EXPECTED_ROOT_URL = import.meta.env.VITE_ROOT_URL;

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: (path: string) => (options: unknown) => ({
    options,
    path,
  }),
}));

vi.mock('~/util/agentMarkdownContent', () => ({
  getIssueMarkdown: mocks.getIssueMarkdown,
  getLineMarkdown: mocks.getLineMarkdown,
  getOperatorMarkdown: mocks.getOperatorMarkdown,
  getOverviewMarkdown: mocks.getOverviewMarkdown,
  getStationMarkdown: mocks.getStationMarkdown,
}));

vi.mock('~/util/issue.functions', () => ({
  getIssueFn: mocks.getIssueFn,
}));

vi.mock('~/util/lines.functions', () => ({
  getLineProfileFn: mocks.getLineProfileFn,
}));

vi.mock('~/util/llmsTxt', () => ({
  getLlmsTxt: mocks.getLlmsTxt,
}));

vi.mock('~/util/operator.functions', () => ({
  getOperatorProfileFn: mocks.getOperatorProfileFn,
}));

vi.mock('~/util/overview.functions', () => ({
  getOverviewFn: mocks.getOverviewFn,
}));

vi.mock('~/util/station.functions', () => ({
  getStationProfileFn: mocks.getStationProfileFn,
}));

type RouteWithGet = {
  options: {
    server: {
      handlers: {
        GET: (context?: {
          params: Record<string, string>;
        }) => Promise<Response>;
      };
    };
  };
};

describe('agent Markdown routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the curated llms.txt entry point as cacheable Markdown', async () => {
    mocks.getLlmsTxt.mockReturnValue('# llms');

    const response = await getHandler(LlmsTxtRoute)();

    expect(mocks.getLlmsTxt).toHaveBeenCalledWith({
      rootUrl: EXPECTED_ROOT_URL,
    });
    await expect(response.text()).resolves.toBe('# llms');
    expectMarkdownResponse(response);
  });

  it('returns overview Markdown from the overview read model', async () => {
    const overviewPayload = { data: { lineSummaries: [] }, included: {} };
    mocks.getOverviewFn.mockResolvedValue(overviewPayload);
    mocks.getOverviewMarkdown.mockReturnValue('# overview');

    const response = await getHandler(IndexMarkdownRoute)();

    expect(mocks.getOverviewFn).toHaveBeenCalledWith({
      data: { days: HOME_OVERVIEW_INITIAL_DATE_COUNT },
    });
    expect(mocks.getOverviewMarkdown).toHaveBeenCalledWith(overviewPayload, {
      rootUrl: EXPECTED_ROOT_URL,
    });
    await expect(response.text()).resolves.toBe('# overview');
    expectMarkdownResponse(response);
  });

  it('returns line Markdown from the line read model', async () => {
    const linePayload = { data: { lineId: 'EWL' }, included: {} };
    mocks.getLineProfileFn.mockResolvedValue(linePayload);
    mocks.getLineMarkdown.mockReturnValue('# line');

    const response = await getHandler(LineMarkdownRoute)({
      params: { lineId: 'EWL' },
    });

    expect(mocks.getLineProfileFn).toHaveBeenCalledWith({
      data: { days: 90, lineId: 'EWL' },
    });
    expect(mocks.getLineMarkdown).toHaveBeenCalledWith(linePayload, {
      rootUrl: EXPECTED_ROOT_URL,
    });
    await expect(response.text()).resolves.toBe('# line');
    expectMarkdownResponse(response);
  });

  it('returns station Markdown from the station read model', async () => {
    const stationPayload = { data: { stationId: 'EW1' }, included: {} };
    mocks.getStationProfileFn.mockResolvedValue(stationPayload);
    mocks.getStationMarkdown.mockReturnValue('# station');

    const response = await getHandler(StationMarkdownRoute)({
      params: { stationId: 'EW1' },
    });

    expect(mocks.getStationProfileFn).toHaveBeenCalledWith({
      data: { stationId: 'EW1' },
    });
    expect(mocks.getStationMarkdown).toHaveBeenCalledWith(stationPayload, {
      rootUrl: EXPECTED_ROOT_URL,
    });
    await expect(response.text()).resolves.toBe('# station');
    expectMarkdownResponse(response);
  });

  it('returns operator Markdown from the operator read model', async () => {
    const operatorPayload = { data: { operatorId: 'SMRT' }, included: {} };
    mocks.getOperatorProfileFn.mockResolvedValue(operatorPayload);
    mocks.getOperatorMarkdown.mockReturnValue('# operator');

    const response = await getHandler(OperatorMarkdownRoute)({
      params: { operatorId: 'SMRT' },
    });

    expect(mocks.getOperatorProfileFn).toHaveBeenCalledWith({
      data: { days: 90, operatorId: 'SMRT' },
    });
    expect(mocks.getOperatorMarkdown).toHaveBeenCalledWith(operatorPayload, {
      rootUrl: EXPECTED_ROOT_URL,
    });
    await expect(response.text()).resolves.toBe('# operator');
    expectMarkdownResponse(response);
  });

  it('returns issue Markdown from the issue read model', async () => {
    const issuePayload = { data: { id: 'issue-1' }, included: {} };
    mocks.getIssueFn.mockResolvedValue(issuePayload);
    mocks.getIssueMarkdown.mockReturnValue('# issue');

    const response = await getHandler(IssueMarkdownRoute)({
      params: { issueId: 'issue-1' },
    });

    expect(mocks.getIssueFn).toHaveBeenCalledWith({
      data: { issueId: 'issue-1' },
    });
    expect(mocks.getIssueMarkdown).toHaveBeenCalledWith(issuePayload, {
      rootUrl: EXPECTED_ROOT_URL,
    });
    await expect(response.text()).resolves.toBe('# issue');
    expectMarkdownResponse(response);
  });

  it('preserves missing-entity responses from the line read model', async () => {
    const notFound = new Response('Line not found', { status: 404 });
    mocks.getLineProfileFn.mockRejectedValue(notFound);

    await expect(
      getHandler(LineMarkdownRoute)({ params: { lineId: 'NOPE' } }),
    ).rejects.toBe(notFound);
    expect(mocks.getLineMarkdown).not.toHaveBeenCalled();
  });

  it('preserves missing-entity responses from the station read model', async () => {
    const notFound = new Response('Station not found', { status: 404 });
    mocks.getStationProfileFn.mockRejectedValue(notFound);

    await expect(
      getHandler(StationMarkdownRoute)({ params: { stationId: 'NOPE' } }),
    ).rejects.toBe(notFound);
    expect(mocks.getStationMarkdown).not.toHaveBeenCalled();
  });

  it('preserves missing-entity responses from the operator read model', async () => {
    const notFound = new Response('Operator not found', { status: 404 });
    mocks.getOperatorProfileFn.mockRejectedValue(notFound);

    await expect(
      getHandler(OperatorMarkdownRoute)({ params: { operatorId: 'NOPE' } }),
    ).rejects.toBe(notFound);
    expect(mocks.getOperatorMarkdown).not.toHaveBeenCalled();
  });

  it('preserves missing-entity responses from the issue read model', async () => {
    const notFound = new Response('Issue not found', { status: 404 });
    mocks.getIssueFn.mockRejectedValue(notFound);

    await expect(
      getHandler(IssueMarkdownRoute)({ params: { issueId: 'NOPE' } }),
    ).rejects.toBe(notFound);
    expect(mocks.getIssueMarkdown).not.toHaveBeenCalled();
  });
});

function getHandler(route: unknown) {
  return (route as RouteWithGet).options.server.handlers.GET;
}

function expectMarkdownResponse(response: Response) {
  expect(response.headers.get('content-type')).toBe(
    'text/markdown; charset=utf-8',
  );
  expect(response.headers.get('cache-control')).toBe(
    'public, max-age=0, must-revalidate',
  );
  expect(response.headers.get('cloudflare-cdn-cache-control')).toBe(
    'public, max-age=900, stale-while-revalidate=300, stale-if-error=86400',
  );
  expect(response.headers.get('cache-tag')).toContain('mrtdown-');
  expect(response.headers.get('x-mrtdown-cache')).toBe('public-markdown');
}
