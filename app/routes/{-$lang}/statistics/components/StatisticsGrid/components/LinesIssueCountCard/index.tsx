import type React from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Chart } from '~/client';

import { Tick } from './components/Tick';
import { TooltipContent } from './components/TooltipContent';

interface Props {
  chart: Chart;
}

export const LinesIssueCountCard: React.FC<Props> = (props) => {
  const { chart } = props;
  const intl = useIntl();

  return (
    <div className="col-span-6 flex flex-col justify-between rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md dark:border-gray-700 dark:bg-gray-900">
      <h3 className="mb-2 font-semibold text-base text-gray-900 dark:text-white">
        <FormattedMessage
          id="general.line_issue_counts"
          defaultMessage="Issue Count by Line"
        />
      </h3>
      <div className="h-64">
        <ResponsiveContainer>
          <BarChart
            accessibilityLayer
            data={chart.data}
            layout="horizontal"
            margin={{ top: 20, left: 0, right: 0, bottom: 40 }}
            barCategoryGap="15%"
          >
            <CartesianGrid
              vertical={false}
              className="stroke-gray-300 dark:stroke-gray-600"
            />
            <XAxis
              type="category"
              dataKey="name"
              className="text-gray-600 text-sm dark:text-gray-300"
              // @ts-ignore
              tick={<Tick />}
              tickMargin={5}
              interval={0}
            />
            <YAxis className="text-gray-700 text-sm dark:text-gray-300" />
            <Bar
              name={intl.formatMessage({
                id: 'general.disruption',
                defaultMessage: 'Disruption',
              })}
              dataKey="payload.disruption"
              className="fill-disruption-light dark:fill-disruption-dark"
              type="monotone"
              strokeWidth={2}
              stackId="issueType"
            />
            <Bar
              name={intl.formatMessage({
                id: 'general.maintenance',
                defaultMessage: 'Maintenance',
              })}
              dataKey="payload.maintenance"
              className="fill-maintenance-light dark:fill-maintenance-dark"
              type="monotone"
              strokeWidth={2}
              stackId="issueType"
            />
            <Bar
              name={intl.formatMessage({
                id: 'general.infrastructure',
                defaultMessage: 'Infrastructure',
              })}
              dataKey="payload.infra"
              className="fill-infra-light dark:fill-infra-dark"
              type="monotone"
              strokeWidth={2}
              stackId="issueType"
            >
              {/*Total Count*/}
              <LabelList
                dataKey="payload.totalIssues"
                position="top"
                offset={8}
                className="fill-gray-400 font-medium text-xs dark:fill-gray-500"
                style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}
              />
            </Bar>
            <Tooltip
              content={<TooltipContent />}
              cursor={{ fill: 'rgba(0, 0, 0, 0.3)' }}
              offset={30}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
