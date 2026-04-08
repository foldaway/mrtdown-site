import * as Popover from '@radix-ui/react-popover';
import classNames from 'classnames';
import { DateTime } from 'luxon';
import type React from 'react';
import { useCallback, useMemo, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import type { Chart } from '~/client';
import { IncludedEntitiesContext } from '~/contexts/IncludedEntities';
import { DayIssuesList } from './components/DayIssuesList';
import { useDayIssues } from './hooks/useDayIssues';

interface Props {
  chart: Chart;
}

interface HeatmapCell {
  date: DateTime;
  totalIssues: number;
  disruption: number;
  maintenance: number;
  infra: number;
  dateString: string;
}

export const DisruptionsHeatmap: React.FC<Props> = (props) => {
  const { chart } = props;
  const intl = useIntl();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);
  const [openPopoverDate, setOpenPopoverDate] = useState<string | null>(null);
  const { issues, included, isLoading, error } = useDayIssues(selectedDate);

  // Parse data into heatmap cells
  const heatmapData = useMemo(() => {
    const cells: HeatmapCell[] = chart.data.map((entry) => {
      const date = DateTime.fromISO(entry.name);
      const totalIssues =
        (entry.payload.disruption as number) +
        (entry.payload.maintenance as number) +
        (entry.payload.infra as number);

      return {
        date,
        totalIssues,
        disruption: entry.payload.disruption as number,
        maintenance: entry.payload.maintenance as number,
        infra: entry.payload.infra as number,
        dateString: entry.name,
      };
    });

    return cells;
  }, [chart.data]);

  // Calculate max value for color scaling (only disruption count)
  const maxValue = useMemo(() => {
    return Math.max(...heatmapData.map((cell) => cell.disruption), 1);
  }, [heatmapData]);

  // Group data by week for GitHub-style layout (weeks as columns, days as rows)
  const groupedData = useMemo(() => {
    if (heatmapData.length === 0) return [];

    const weeks: (HeatmapCell | null)[][] = [];
    let currentWeek: (HeatmapCell | null)[] = [];

    // GitHub's grid starts on Sunday.
    // Luxon: 1=Mon, 7=Sun.
    // We want Sun=0, Mon=1, ..., Sat=6.
    const getGitHubWeekday = (date: DateTime) => {
      const luxonWeekday = date.weekday;
      return luxonWeekday === 7 ? 0 : luxonWeekday;
    };

    const firstDate = heatmapData[0].date;
    const startPadding = getGitHubWeekday(firstDate);

    for (let i = 0; i < startPadding; i++) {
      currentWeek.push(null);
    }

    heatmapData.forEach((cell) => {
      currentWeek.push(cell);
      if (currentWeek.length === 7) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
    });

    if (currentWeek.length > 0) {
      while (currentWeek.length < 7) {
        currentWeek.push(null);
      }
      weeks.push(currentWeek);
    }

    return weeks;
  }, [heatmapData]);

  const monthLabels = useMemo(() => {
    const labels: { month: string; weekIndex: number }[] = [];
    const monthsSeen = new Set<number>();

    groupedData.forEach((week, weekIndex) => {
      week.forEach((cell, dayIndex) => {
        if (cell) {
          const cellMonth = cell.date.month;
          const cellDay = cell.date.day;
          
          // Only add label if this is the 1st of the month and we haven't seen it yet
          if (cellDay === 1 && !monthsSeen.has(cellMonth)) {
            labels.push({
              month: intl.formatDate(cell.date.toJSDate(), {
                month: 'short',
              }),
              weekIndex: weekIndex,
            });
            monthsSeen.add(cellMonth);
          }
        }
      });
    });

    return labels;
  }, [groupedData, intl]);

  const getCellColor = useCallback(
    (value: number) => {
      if (value === 0) return 'bg-gray-100 dark:bg-gray-800';
      const intensity = value / maxValue;
      if (intensity <= 0.25) return 'bg-red-200 dark:bg-red-900/40';
      if (intensity <= 0.5) return 'bg-red-400 dark:bg-red-700/60';
      if (intensity <= 0.75) return 'bg-red-600 dark:bg-red-500';
      return 'bg-red-800 dark:bg-red-300';
    },
    [maxValue],
  );

  return (
    <IncludedEntitiesContext.Provider value={included}>
    <div className="col-span-6 flex flex-col rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md dark:border-gray-700 dark:bg-gray-900">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-base text-gray-900 dark:text-white">
            <FormattedMessage
              id="general.disruptions_heatmap"
              defaultMessage="Disruptions Heatmap"
            />
          </h3>
          <p className="text-gray-500 text-sm dark:text-gray-400">
            <FormattedMessage
              id="general.heatmap_description"
              defaultMessage="Issue count over time"
            />
          </p>
        </div>
      </div>

      <div className="relative mb-2 overflow-x-auto pb-2">
        <div className="inline-flex flex-col">
          {/* Month headers */}
          <div className="flex h-6">
            <div className="w-8 shrink-0" /> {/* Spacer for day labels */}
            <div className="relative flex-1">
              {monthLabels.map((label) => (
                <div
                  key={`${label.month}-${label.weekIndex}`}
                  className="absolute text-[10px] text-gray-500 dark:text-gray-400"
                  style={{ left: `calc(${label.weekIndex} * (12px + 4px))` }}
                >
                  {label.month}
                </div>
              ))}
            </div>
          </div>

          <div className="flex">
            {/* Day labels */}
            <div className="mr-2 flex flex-col justify-between py-[2px] text-[9px] text-gray-400 uppercase">
              <div className="h-[11px] leading-[11px]">Sun</div>
              <div className="h-[11px] leading-[11px]">Mon</div>
              <div className="h-[11px] leading-[11px]">Tue</div>
              <div className="h-[11px] leading-[11px]">Wed</div>
              <div className="h-[11px] leading-[11px]">Thu</div>
              <div className="h-[11px] leading-[11px]">Fri</div>
              <div className="h-[11px] leading-[11px]">Sat</div>
            </div>

            {/* Heatmap grid */}
            <div className="flex gap-1">
              {groupedData.map((week, weekIndex) => {
                const weekKey =
                  week.find((c) => c !== null)?.dateString ??
                  `week-${weekIndex}`;
                return (
                  <div key={weekKey} className="flex flex-col gap-1">
                    {week.map((cell, dayIndex) => {
                      if (!cell) {
                        return (
                          <div
                            key={`padding-${weekKey}-${['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][dayIndex]}`}
                            className="size-3 rounded-[2px]"
                          />
                        );
                      }

                      return (
                        <Popover.Root
                          key={cell.dateString}
                          open={hoveredDate === cell.dateString || openPopoverDate === cell.dateString}
                          onOpenChange={(open) => {
                            if (!open) {
                              setHoveredDate(null);
                              setOpenPopoverDate(null);
                            } else {
                              setOpenPopoverDate(cell.dateString);
                            }
                          }}
                        >
                          <Popover.Trigger asChild>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedDate(cell.dateString);
                                setOpenPopoverDate(cell.dateString);
                              }}
                              onMouseEnter={() => {
                                setHoveredDate(cell.dateString);
                                setOpenPopoverDate(cell.dateString);
                              }}
                              onMouseLeave={() => {
                                if (selectedDate !== cell.dateString) {
                                  setHoveredDate(null);
                                  setOpenPopoverDate(null);
                                }
                              }}
                              className={classNames(
                                'size-3 cursor-pointer rounded-[2px] transition-all hover:ring-2 hover:ring-blue-400 hover:ring-offset-1 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:hover:ring-offset-gray-900',
                                selectedDate === cell.dateString && 'ring-2 ring-blue-500 ring-offset-1 dark:ring-offset-gray-900',
                                getCellColor(cell.disruption),
                              )}
                              aria-label={`${intl.formatDate(cell.date.toJSDate(), { month: 'short', day: 'numeric' })}: ${cell.disruption} disruptions. Click to view issues.`}
                            />
                          </Popover.Trigger>
                          <Popover.Portal>
                            <Popover.Content
                              className="z-50 rounded-lg border border-gray-200 bg-white p-3 shadow-lg dark:border-gray-700 dark:bg-gray-800"
                              sideOffset={5}
                            >
                              <div className="space-y-1">
                                <div className="font-semibold text-gray-900 text-xs dark:text-white">
                                  {intl.formatDate(cell.date.toJSDate(), {
                                    weekday: 'long',
                                    month: 'long',
                                    day: 'numeric',
                                    year: 'numeric',
                                  })}
                                </div>
                                <div className="text-gray-600 text-xs dark:text-gray-400">
                                  <FormattedMessage
                                    id="general.disruption"
                                    defaultMessage="Disruption"
                                  />
                                </div>
                                <div className="font-medium text-gray-900 dark:text-white">
                                  {cell.disruption}
                                </div>
                              </div>
                              <Popover.Arrow className="fill-white dark:fill-gray-800" />
                            </Popover.Content>
                          </Popover.Portal>
                        </Popover.Root>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-end gap-1.5 text-[10px] text-gray-500 dark:text-gray-400">
        <span>Less</span>
        <div className="size-3 rounded-[2px] bg-gray-100 dark:bg-gray-800" />
        <div className="size-3 rounded-[2px] bg-red-200 dark:bg-red-900/40" />
        <div className="size-3 rounded-[2px] bg-red-400 dark:bg-red-700/60" />
        <div className="size-3 rounded-[2px] bg-red-600 dark:bg-red-500" />
        <div className="size-3 rounded-[2px] bg-red-800 dark:bg-red-300" />
        <span>More</span>
      </div>

      {selectedDate && (
        <div className="mt-6 space-y-4 border-gray-200 border-t pt-6 dark:border-gray-700">
          <DayIssuesList
            dateString={selectedDate}
            issues={issues}
            included={included}
            isLoading={isLoading}
            error={error}
          />
        </div>
      )}
    </div>
    </IncludedEntitiesContext.Provider>
  );
};
