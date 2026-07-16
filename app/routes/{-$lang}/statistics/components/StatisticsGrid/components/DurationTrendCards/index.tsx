import classNames from 'classnames';
import { Duration } from 'luxon';
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
import { FormattedDuration } from '~/components/FormattedDuration';
import { getDateFormatOptions } from '~/helpers/getDateFormatOptions';
import { StatisticsCard } from '../StatisticsCard';
import { CustomTooltip } from './components/CustomTooltip';
import { displayMsFormatter } from './helpers/formatters';

interface Props {
  graphs: TimeScaleChart[];
}

export const DurationTrendCards: React.FC<Props> = (props) => {
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
    <StatisticsCard
      header={
        <h2 className="font-semibold text-gray-900 text-sm leading-5 dark:text-gray-100">
          <FormattedMessage
            id="general.issue_duration_past_period"
            defaultMessage="Issue duration (past {period})"
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
      }
    >
      <div className="font-bold text-2xl text-gray-900 tracking-tight sm:text-3xl dark:text-gray-100">
        <FormattedMessage
          id="general.disruption_time_count"
          defaultMessage="{duration} of disruption"
          values={{
            duration: (
              <FormattedDuration
                duration={Duration.fromObject({
                  seconds: graph.dataCumulative[0].payload.disruption as number,
                })}
              />
            ),
          }}
        />
      </div>
      <p className="text-gray-500 text-xs dark:text-gray-400">
        <FormattedMessage
          id="general.change_since_previous"
          defaultMessage="{change} vs previous"
          values={{
            change: (
              <FormattedDuration
                signDisplay="always"
                duration={Duration.fromObject({
                  seconds:
                    (graph.dataCumulative[0].payload.disruption as number) -
                    (graph.dataCumulative[1].payload.disruption as number),
                })}
              />
            ),
          }}
        />
      </p>
      <div className="mt-3 h-40 sm:h-44">
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
              tick={{ fontSize: 11, fontWeight: 500 }}
              axisLine={{ stroke: 'currentColor', strokeWidth: 1 }}
              tickLine={{ stroke: 'currentColor', strokeWidth: 1 }}
              height={42}
            />
            <Tooltip
              formatter={displayMsFormatter}
              content={(tooltipProps) => (
                <CustomTooltip
                  {...tooltipProps}
                  granularity={graph.dataTimeScale.granularity}
                />
              )}
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
            />

            <Line
              dataKey="payload.infra"
              className="stroke-infra-light dark:stroke-infra-dark"
              stroke=""
              radius={5}
              type="monotone"
              strokeWidth={2}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-3 overflow-x-auto pb-0.5">
        <div className="flex w-max items-center divide-x divide-gray-200 rounded-lg border border-gray-200 bg-gray-50 shadow-sm dark:divide-gray-700 dark:border-gray-700 dark:bg-gray-900/50">
          {graphs.map((graph, index) => (
            <button
              key={graph.title}
              className={classNames(
                'px-2.5 py-1.5 font-medium text-xs transition-colors first:rounded-l-lg last:rounded-r-lg hover:bg-gray-100 dark:hover:bg-gray-700',
                graphIndex === index
                  ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300'
                  : 'text-gray-600 dark:text-gray-400',
              )}
              type="button"
              onClick={() => setGraphIndex(index)}
            >
              <FormattedNumber
                value={
                  graph.displayTimeScale?.count ?? graph.dataTimeScale.count
                }
                style="unit"
                unitDisplay="long"
                unit={
                  graph.displayTimeScale?.granularity ??
                  graph.dataTimeScale.granularity
                }
              />
            </button>
          ))}
        </div>
      </div>
    </StatisticsCard>
  );
};
