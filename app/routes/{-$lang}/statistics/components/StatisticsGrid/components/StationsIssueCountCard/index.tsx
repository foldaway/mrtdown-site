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
import type { SystemAnalytics } from '~/util/dbQueries/statistics';
import { StatisticsCard } from '../StatisticsCard';
import { Tick } from './components/Tick';
import { TooltipContent } from './components/TooltipContent';

interface Props {
  chart: SystemAnalytics['chartTotalIssueCountByStation'];
}

export const StationsIssueCountCard: React.FC<Props> = (props) => {
  const { chart } = props;

  const intl = useIntl();

  return (
    <StatisticsCard
      contentClassName="px-2 pt-2 pb-3 sm:px-3 sm:pt-3 sm:pb-4"
      header={
        <h2 className="font-semibold text-gray-900 text-sm leading-5 dark:text-gray-100">
          <FormattedMessage
            id="general.station_issue_counts"
            defaultMessage="Issue Count by Station"
          />
        </h2>
      }
    >
      <div className="flex h-64 w-full sm:h-72">
        <ResponsiveContainer>
          <BarChart
            accessibilityLayer
            data={chart.data}
            layout="horizontal"
            margin={{ top: 20, left: 0, right: 0, bottom: 80 }}
            barCategoryGap="15%"
          >
            <CartesianGrid
              vertical={false}
              className="stroke-gray-300 dark:stroke-gray-600"
            />
            <XAxis
              type="category"
              dataKey="name"
              className="text-gray-700 text-sm dark:text-gray-300"
              axisLine={false}
              // @ts-ignore
              tick={<Tick />}
              minTickGap={0}
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
              strokeWidth={0}
              stackId="issueType"
              radius={[0, 0, 0, 0]}
            />

            <Bar
              name={intl.formatMessage({
                id: 'general.maintenance',
                defaultMessage: 'Maintenance',
              })}
              dataKey="payload.maintenance"
              className="fill-maintenance-light dark:fill-maintenance-dark"
              type="monotone"
              strokeWidth={0}
              stackId="issueType"
              radius={[0, 0, 0, 0]}
            />

            <Bar
              name={intl.formatMessage({
                id: 'general.infrastructure',
                defaultMessage: 'Infrastructure',
              })}
              dataKey="payload.infra"
              className="fill-infra-light dark:fill-infra-dark"
              type="monotone"
              strokeWidth={0}
              stackId="issueType"
              radius={[3, 3, 0, 0]}
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
    </StatisticsCard>
  );
};
