import classNames from 'classnames';
import type React from 'react';
import { useCallback, useMemo, useState } from 'react';
import { FormattedMessage, FormattedNumber, useIntl } from 'react-intl';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from 'recharts';
import type { TimeScaleChart } from '~/client';
import { getDateFormatOptions } from '../../../../helpers/getDateFormatOptions';
import { CustomTooltip } from './components/CustomTooltip';

interface Props {
  graphs: TimeScaleChart[];
}

export const UptimeRatioTrendCards: React.FC<Props> = (props) => {
  const { graphs } = props;

  const intl = useIntl();

  const [graphIndex, setGraphIndex] = useState(0);
  const graph = useMemo(() => graphs[graphIndex], [graphs, graphIndex]);

  const tickFormatter = useCallback(
    (date: string) => {
      return intl.formatDate(
        date,
        getDateFormatOptions(graph.dataTimeScale.granularity),
      );
    },
    [intl, graph],
  );

  return (
    <div className="flex flex-col rounded-lg border border-gray-300 p-6 text-gray-800 shadow-lg md:col-span-12 lg:col-span-8 dark:border-gray-700 dark:text-gray-200">
      <span className="font-semibold text-base text-gray-900 dark:text-white">
        <FormattedMessage
          id="general.uptime_trend_past_period"
          defaultMessage="Uptime trend (past {period})"
          values={{
            period: (
              <FormattedNumber
                value={
                  graph.displayTimeScale?.count ?? graph.dataTimeScale.count
                }
                unit={
                  graph.displayTimeScale?.granularity ??
                  graph.dataTimeScale.granularity
                }
                unitDisplay="long"
                style="unit"
              />
            ),
          }}
        />
      </span>
      <span className="mt-2.5 font-bold text-4xl">
        <FormattedNumber
          value={graph.dataCumulative[0].payload.uptimeRatio}
          style="percent"
          maximumFractionDigits={2}
        />
      </span>
      <span className="text-gray-500 text-sm dark:text-gray-400">
        <FormattedMessage
          id="general.change_since_previous"
          defaultMessage="{change} vs previous"
          values={{
            change: (
              <FormattedNumber
                value={
                  (graph.dataCumulative[0].payload.uptimeRatio as number) -
                  (graph.dataCumulative[1].payload.uptimeRatio as number)
                }
                signDisplay="always"
                style="percent"
                maximumFractionDigits={2}
              />
            ),
          }}
        />
      </span>
      <div className="mt-4 h-48">
        <ResponsiveContainer>
          <LineChart
            accessibilityLayer
            data={graph.data}
            layout="horizontal"
            margin={{ top: 30, left: 5, right: 5, bottom: 5 }}
          >
            <CartesianGrid
              vertical={false}
              className="stroke-gray-300 dark:stroke-gray-600"
            />
            <XAxis
              type="category"
              dataKey="name"
              className="text-gray-700 text-sm dark:text-gray-200"
              tickFormatter={tickFormatter}
              tick={{ fontSize: 12, fontWeight: 500 }}
              axisLine={{ stroke: 'currentColor', strokeWidth: 1 }}
              tickLine={{ stroke: 'currentColor', strokeWidth: 1 }}
              height={50}
            />
            <Line
              dataKey="payload.uptimeRatio"
              className="stroke-sky-600 dark:stroke-sky-700"
              stroke=""
              radius={5}
              type="monotone"
              strokeWidth={2}
            />
            <Tooltip
              content={(tooltipProps) => (
                // @ts-expect-error typing issue
                <CustomTooltip
                  {...tooltipProps}
                  granularity={graph.dataTimeScale.granularity}
                />
              )}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-4 flex items-center self-start">
        <div className="flex items-center divide-x divide-gray-200 self-start rounded-lg border border-gray-200 bg-gray-50 shadow-sm dark:divide-gray-700 dark:border-gray-700 dark:bg-gray-800">
          {graphs.map((graph, index) => (
            <button
              key={graph.title}
              className={classNames(
                'px-3 py-2 font-medium text-sm transition-colors first:rounded-l-lg last:rounded-r-lg hover:bg-gray-100 dark:hover:bg-gray-700',
                graphIndex === index
                  ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300'
                  : 'text-gray-600 dark:text-gray-400',
              )}
              type="button"
              onClick={() => setGraphIndex(index)}
            >
              <FormattedNumber
                style="unit"
                unitDisplay="long"
                unit={
                  graph.displayTimeScale?.granularity ??
                  graph.dataTimeScale.granularity
                }
                value={
                  graph.displayTimeScale?.count ?? graph.dataTimeScale.count
                }
              />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
