import type { Translations } from '@mrtdown/core';
import type { IntlShape } from 'react-intl';
import { getLocalizedTranslation } from '~/helpers/getLocalizedTranslation';
import type { WeeklySummary } from './weeklyReport';
import { weeklyMessages } from './weeklyReport.messages';

export type WeeklyBaseline = {
  disruptionCount: number;
  disruptionSeconds: number;
  lineIssueIds?: Record<string, string[]>;
};
type InsightInput = {
  current: WeeklySummary;
  previous: WeeklyBaseline;
  partial: boolean;
  recentWeeks: WeeklyBaseline[];
};
export type WeeklyInsight =
  | { kind: 'quiet' | 'longer' | 'shorter' | 'single' }
  | {
      kind: 'recent';
      direction: 'above' | 'below' | 'similar';
      average: number;
    }
  | { kind: 'concentrated'; percent: number }
  | { kind: 'spread'; days: number }
  | { kind: 'suspension' | 'maintenance'; lines: Translations[] }
  | { kind: 'peak'; count: number }
  | { kind: 'line'; line: Translations }
  | { kind: 'network'; count: number }
  | { kind: 'return'; line: Translations; weeks: number }
  | { kind: 'recurring'; line: Translations }
  | { kind: 'first'; weeks: number }
  | { kind: 'weekend'; percent: number }
  | { kind: 'interchanges'; stations: Translations[] }
  | { kind: 'multiDay'; days: number }
  | { kind: 'maintenanceChange'; lines: Translations[] };

function generateWeeklyCandidates({
  current,
  previous,
  partial,
  recentWeeks,
}: InsightInput): WeeklyInsight[] {
  const context = current.readerContext;
  if (current.disruptionCount === 0)
    return context.maintenanceLines.length
      ? [
          { kind: 'quiet' },
          { kind: 'maintenance', lines: context.maintenanceLines.slice(0, 2) },
        ]
      : [{ kind: 'quiet' }];
  const readerInsights: WeeklyInsight[] = [];
  if (context.suspensionLines.length)
    readerInsights.push({
      kind: 'suspension',
      lines: context.suspensionLines.slice(0, 2),
    });
  else if (context.peakIncidentCount > 0)
    readerInsights.push({ kind: 'peak', count: context.peakIncidentCount });
  else if (current.lines.length === 1)
    readerInsights.push({ kind: 'line', line: current.lines[0].name });
  else if (current.lines.length >= 3)
    readerInsights.push({ kind: 'network', count: current.lines.length });
  if (!partial) {
    for (const line of current.lines) {
      const currentIds = context.lineIssueIds[line.id] ?? [];
      const history = recentWeeks.map((week) => week.lineIssueIds?.[line.id]);
      // Three weeks must contain separate incidents, rather than one ongoing issue.
      if (
        history[0] &&
        history[1] &&
        currentIds.some((id) =>
          history[0]?.some(
            (last) =>
              last !== id &&
              history[1]?.some((older) => older !== last && older !== id),
          ),
        )
      ) {
        readerInsights.push({ kind: 'recurring', line: line.name });
        break;
      }
      let clearWeeks = 0;
      for (const ids of history) {
        if (ids == null || ids.length > 0) break;
        clearWeeks++;
      }
      if (clearWeeks >= 3) {
        readerInsights.push({
          kind: 'return',
          line: line.name,
          weeks: clearWeeks,
        });
        break;
      }
    }
    if (
      !readerInsights.some((insight) => insight.kind === 'return') &&
      recentWeeks.length === 4 &&
      recentWeeks.every((week) => week.disruptionCount === 0)
    )
      readerInsights.push({ kind: 'first', weeks: 4 });
  }

  const insights: WeeklyInsight[] = [];
  if (
    current.disruptionCount < previous.disruptionCount &&
    current.disruptionSeconds > previous.disruptionSeconds
  )
    insights.push({ kind: 'longer' });
  else if (
    current.disruptionCount > previous.disruptionCount &&
    current.disruptionSeconds < previous.disruptionSeconds
  )
    insights.push({ kind: 'shorter' });
  else if (!partial && recentWeeks.length === 4) {
    const average =
      recentWeeks.reduce((sum, week) => sum + week.disruptionCount, 0) / 4;
    const difference = current.disruptionCount - average;
    // A 20% band avoids turning small changes into a strong trend claim.
    insights.push({
      kind: 'recent',
      average,
      direction:
        Math.abs(difference) <= average * 0.2
          ? 'similar'
          : difference > 0
            ? 'above'
            : 'below',
    });
  }
  if (current.disruptionCount === 1) insights.push({ kind: 'single' });
  else {
    const longest = Math.max(
      ...current.incidents.map((incident) => incident.seconds),
    );
    const share =
      current.disruptionSeconds > 0 ? longest / current.disruptionSeconds : 0;
    const days = current.days.filter((day) => day.count > 0).length;
    if (share >= 0.6)
      insights.push({ kind: 'concentrated', percent: Math.round(share * 100) });
    else if (days >= 4) insights.push({ kind: 'spread', days });
  }
  return [...readerInsights, ...insights];
}

type InsightCategory =
  | 'service'
  | 'timing'
  | 'reach'
  | 'history'
  | 'comparison'
  | 'concentration'
  | 'quiet';
const INSIGHT_PRIORITY: Record<
  WeeklyInsight['kind'],
  { score: number; category: InsightCategory }
> = {
  suspension: { score: 100, category: 'service' },
  maintenanceChange: { score: 95, category: 'service' },
  peak: { score: 90, category: 'timing' },
  recurring: { score: 85, category: 'history' },
  interchanges: { score: 80, category: 'reach' },
  longer: { score: 75, category: 'comparison' },
  shorter: { score: 75, category: 'comparison' },
  multiDay: { score: 70, category: 'timing' },
  network: { score: 65, category: 'reach' },
  weekend: { score: 60, category: 'timing' },
  return: { score: 55, category: 'history' },
  first: { score: 50, category: 'history' },
  maintenance: { score: 45, category: 'service' },
  concentrated: { score: 40, category: 'concentration' },
  spread: { score: 35, category: 'timing' },
  line: { score: 30, category: 'reach' },
  recent: { score: 20, category: 'comparison' },
  single: { score: 10, category: 'concentration' },
  quiet: { score: 5, category: 'quiet' },
};

export function selectWeeklyInsights(input: InsightInput): WeeklyInsight[] {
  const { current } = input;
  const context = current.readerContext;
  const candidates = generateWeeklyCandidates(input);
  if (context.interchangeNames.length)
    candidates.push({
      kind: 'interchanges',
      stations: context.interchangeNames,
    });
  if (context.multiDayIncidentDays >= 3)
    candidates.push({ kind: 'multiDay', days: context.multiDayIncidentDays });
  if (
    current.disruptionSeconds > 0 &&
    context.weekendSeconds / current.disruptionSeconds >= 0.75
  )
    candidates.push({
      kind: 'weekend',
      percent: Math.round(
        (context.weekendSeconds / current.disruptionSeconds) * 100,
      ),
    });
  if (context.maintenanceChangeLines.length)
    candidates.push({
      kind: 'maintenanceChange',
      lines: context.maintenanceChangeLines.slice(0, 2),
    });
  const selected: WeeklyInsight[] = [];
  const categories = new Set<InsightCategory>();
  for (const candidate of candidates.sort(
    (a, b) => INSIGHT_PRIORITY[b.kind].score - INSIGHT_PRIORITY[a.kind].score,
  )) {
    const { category } = INSIGHT_PRIORITY[candidate.kind];
    if (categories.has(category)) continue;
    // Quiet-stretch history already establishes an isolated return on the line.
    if (
      (candidate.kind === 'line' || candidate.kind === 'single') &&
      selected.some(
        (insight) => insight.kind === 'return' || insight.kind === 'first',
      )
    )
      continue;
    if (candidate.kind === 'recent' && candidate.average === 0) continue;
    selected.push(candidate);
    categories.add(category);
    if (selected.length === 2) break;
  }
  return selected;
}

export function formatWeeklyInsights(input: InsightInput, intl: IntlShape) {
  return selectWeeklyInsights(input).map((insight) => {
    switch (insight.kind) {
      case 'interchanges':
        return intl.formatMessage(weeklyMessages.digestInterchanges, {
          stations: intl.formatList(
            insight.stations.map((station) =>
              getLocalizedTranslation(station, intl.locale),
            ),
            { type: 'conjunction' },
          ),
        });
      case 'weekend':
        return intl.formatMessage(weeklyMessages.digestWeekend, {
          percent: insight.percent,
        });
      case 'multiDay':
        return intl.formatMessage(weeklyMessages.digestMultiDay, {
          days: insight.days,
        });
      case 'maintenanceChange':
        return intl.formatMessage(weeklyMessages.digestMaintenanceChange, {
          lines: intl.formatList(
            insight.lines.map((line) =>
              getLocalizedTranslation(line, intl.locale),
            ),
            { type: 'conjunction' },
          ),
        });
      case 'suspension':
      case 'maintenance':
        return intl.formatMessage(
          insight.kind === 'suspension'
            ? weeklyMessages.readerSuspension
            : weeklyMessages.readerMaintenance,
          {
            lines: intl.formatList(
              insight.lines.map((line) =>
                getLocalizedTranslation(line, intl.locale),
              ),
              { type: 'conjunction' },
            ),
          },
        );
      case 'peak':
        return intl.formatMessage(weeklyMessages.readerPeak, {
          count: insight.count,
        });
      case 'line':
        return intl.formatMessage(weeklyMessages.readerLine, {
          line: getLocalizedTranslation(insight.line, intl.locale),
        });
      case 'network':
        return intl.formatMessage(weeklyMessages.readerNetwork, {
          count: insight.count,
        });
      case 'return':
        return intl.formatMessage(weeklyMessages.readerReturn, {
          line: getLocalizedTranslation(insight.line, intl.locale),
          weeks: insight.weeks,
        });
      case 'recurring':
        return intl.formatMessage(weeklyMessages.readerRecurring, {
          line: getLocalizedTranslation(insight.line, intl.locale),
        });
      case 'first':
        return intl.formatMessage(weeklyMessages.readerFirst, {
          weeks: insight.weeks,
        });
      case 'recent':
        return intl.formatMessage(weeklyMessages.insightRecent, {
          direction: insight.direction,
          average: intl.formatNumber(insight.average, {
            maximumFractionDigits: 2,
          }),
        });
      case 'concentrated':
        return intl.formatMessage(weeklyMessages.insightConcentrated, {
          percent: insight.percent,
        });
      case 'spread':
        return intl.formatMessage(weeklyMessages.insightSpread, {
          days: insight.days,
        });
      case 'quiet':
        return intl.formatMessage(weeklyMessages.insightQuiet);
      case 'longer':
        return intl.formatMessage(
          input.partial
            ? weeklyMessages.insightLongerPartial
            : weeklyMessages.insightLonger,
        );
      case 'shorter':
        return intl.formatMessage(
          input.partial
            ? weeklyMessages.insightShorterPartial
            : weeklyMessages.insightShorter,
        );
      case 'single':
        return intl.formatMessage(weeklyMessages.insightSingle);
    }
  });
}
