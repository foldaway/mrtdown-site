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
import type { TimeScaleChart } from '~/types';
import { getDateFormatOptions } from '~/helpers/getDateFormatOptions';
import { CustomTooltip } from './components/CustomTooltip';

interface Props {
  graphs: TimeScaleChart[];
}

export const CountTrendCards: React.FC<Props> = (props) => {
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
    <section className="flex flex-col rounded-2xl border border-gray-200 bg-white px-4 py-3 text-gray-800 shadow-sm sm:px-5 sm:py-4 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
      <h2 className="font-semibold text-gray-900 text-sm leading-5 dark:text-gray-100">
        <FormattedMessage
          id="general.issues_past_period"
          defaultMessage="Issue Count (past {period})"
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
      </h2>
      <span className="mt-2 font-bold text-2xl tracking-tight sm:text-3xl">
        <FormattedMessage
          id="general.disruption_count"
          defaultMessage="{count, plural, one {{count} disruption} other {{count} disruptions}}"
          values={{
            count:
              (graph.dataCumulative[0]?.payload?.disruption as number) ?? 0,
          }}
        />
      </span>
      <span className="text-gray-500 text-xs dark:text-gray-400">
        <FormattedMessage
          id="general.change_since_previous"
          defaultMessage="{change} vs previous"
          values={{
            change: (
              <FormattedNumber
                value={
                  ((graph.dataCumulative[0]?.payload?.disruption as number) ??
                    0) -
                  ((graph.dataCumulative[1]?.payload?.disruption as number) ??
                    0)
                }
                signDisplay="always"
              />
            ),
          }}
        />
      </span>
      <div className="mt-3 h-44 sm:h-52">
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
              dataKey="payload.disruption"
              className="stroke-disruption-light dark:stroke-disruption-dark"
              stroke=""
              radius={5}
              type="monotone"
              strokeWidth={2}
            />
            <Line
              dataKey="payload.maintenance"
              className="stroke-maintenance-light dark:stroke-maintenance-dark"
              stroke=""
              radius={5}
              type="monotone"
              strokeWidth={2}
            />{' '}
            <Line
              dataKey="payload.infra"
              className="stroke-infra-light dark:stroke-infra-dark"
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
      <div className="mt-3 flex items-center self-start">
        <div className="flex items-center divide-x divide-gray-200 self-start rounded-lg border border-gray-200 bg-gray-50 shadow-sm dark:divide-gray-700 dark:border-gray-700 dark:bg-gray-800">
          {graphs.map((graph, index) => (
            <button
              key={graph.title}
              className={classNames(
                'font-medium transition-colors first:rounded-l-lg last:rounded-r-lg hover:bg-gray-100 dark:hover:bg-gray-700',
                'px-2.5 py-1.5 text-xs',
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
    </section>
  );
};
