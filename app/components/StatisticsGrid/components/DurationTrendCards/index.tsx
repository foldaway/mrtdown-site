import classNames from 'classnames';
import { DateTime, Duration } from 'luxon';
import type React from 'react';
import { useCallback, useMemo, useState } from 'react';
import {
  FormattedMessage,
  FormattedNumber,
  FormattedRelativeTime,
  useIntl,
} from 'react-intl';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from 'recharts';
import type { TimeScaleChart } from '~/client';
import { FormattedDuration } from '~/components/FormattedDuration';
import { getDateFormatOptions } from '../../../../helpers/getDateFormatOptions';
import type { IssueType, Statistics } from '../../../../types';
import { assert } from '../../../../util/assert';
import { CustomTooltip } from './components/CustomTooltip';
import { changeMsFormatter, displayMsFormatter } from './helpers/formatters';
import type { Data } from './types';

type Bucket = {
  display?: {
    unit: 'day' | 'month' | 'year';
    count: number;
  };
  data: {
    unit: 'day' | 'month' | 'year';
    count: number;
  };
};

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
    <div className="flex flex-col rounded-lg border border-gray-300 p-6 shadow-lg sm:col-span-3 dark:border-gray-700">
      <span className="text-base">
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
      </span>
      <span className="mt-2.5 font-bold text-4xl">
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
      </span>
      <span className="text-gray-400 text-sm dark:text-gray-500">
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
              className="text-gray-600 text-sm dark:text-gray-300"
              tickFormatter={tickFormatter}
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
      <div className="flex items-center divide-x divide-gray-300 self-start rounded-md border border-gray-300 dark:divide-gray-600 dark:border-gray-600">
        {graphs.map((graph, index) => (
          <button
            key={graph.title}
            className={classNames(
              'px-2 py-0.5 text-xs',
              graphIndex === index
                ? 'bg-gray-400 text-gray-50 dark:bg-gray-500 dark:text-gray-200'
                : 'text-gray-400 dark:text-gray-500',
            )}
            type="button"
            onClick={() => setGraphIndex(index)}
          >
            <FormattedNumber
              value={graph.displayTimeScale?.count ?? graph.dataTimeScale.count}
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
  );
};
