import classNames from 'classnames';
import { DateTime, Duration } from 'luxon';
import type React from 'react';
import { useMemo, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from 'recharts';
import type { IssueType, Statistics } from '../../../../types';
import { assert } from '../../../../util/assert';
import { CustomTooltip } from './components/CustomTooltip';
import { changeMsFormatter, displayMsFormatter } from './helpers/formatters';
import type { Data } from './types';
import {
  FormattedMessage,
  FormattedNumber,
  FormattedRelativeTime,
  useIntl,
} from 'react-intl';
import { FormattedDuration } from '~/components/FormattedDuration';

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
  statistics: Statistics;
}

const BUCKETS: Bucket[] = [
  {
    data: {
      unit: 'day',
      count: 7,
    },
  },
  {
    display: {
      unit: 'month',
      count: 1,
    },
    data: {
      unit: 'day',
      count: 28,
    },
  },
  {
    data: {
      unit: 'month',
      count: 6,
    },
  },
  {
    data: {
      unit: 'month',
      count: 12,
    },
  },
  {
    data: {
      unit: 'year',
      count: 10,
    },
  },
  {
    data: {
      unit: 'year',
      count: 20,
    },
  },
];

export const DurationTrendCards: React.FC<Props> = (props) => {
  const { statistics } = props;

  const intl = useIntl();

  const [bucket, setBucket] = useState<Bucket>({
    data: {
      unit: 'month',
      count: 6,
    },
  });

  const chartData = useMemo<Data[]>(() => {
    const dataByBucket: Record<string, Data> = {};

    const currentBucketDateTime = DateTime.now().startOf(bucket.data.unit);

    let format: string;
    switch (bucket.data.unit) {
      case 'day': {
        format = 'd/M';
        break;
      }
      case 'month': {
        format = 'LLLL';
        break;
      }
      case 'year': {
        format = 'yyyy';
        break;
      }
    }

    for (let i = 0; i < bucket.data.count; i++) {
      const bucketDateTime = currentBucketDateTime.minus({
        [bucket.data.unit]: i,
      });
      const bucketIso = bucketDateTime.toISODate();
      dataByBucket[bucketIso] = {
        bucketLabel: bucketDateTime
          .reconfigure({ locale: intl.locale })
          .toFormat(format),
        durationMsByIssueType: {
          disruption: 0,
          maintenance: 0,
          infra: 0,
        },
      };
    }

    for (const [dateIso, dateSummary] of Object.entries(statistics.dates)) {
      const dateTime = DateTime.fromISO(dateIso);
      assert(dateTime.isValid);
      if (
        currentBucketDateTime
          .diff(dateTime.startOf(bucket.data.unit))
          .as(bucket.data.unit) >= bucket.data.count
      ) {
        continue;
      }
      const bucketDateTime = dateTime.startOf(bucket.data.unit);
      const bucketIso = bucketDateTime.toISODate();
      for (const issueType of [
        'disruption',
        'maintenance',
        'infra',
      ] satisfies IssueType[]) {
        const bucketData = dataByBucket[bucketIso] ?? {
          bucketLabel: bucketDateTime
            .reconfigure({ locale: intl.locale })
            .toFormat(format),
          durationMsByIssueType: {
            disruption: 0,
            maintenance: 0,
            infra: 0,
          },
        };
        bucketData.durationMsByIssueType[issueType] +=
          dateSummary.issueTypesDurationMs[issueType] ?? 0;
        dataByBucket[bucketIso] = bucketData;
      }
    }

    const data: Data[] = [];

    const bucketKeys = Object.keys(dataByBucket);
    bucketKeys.sort();

    for (const bucketKey of bucketKeys) {
      const bucketData = dataByBucket[bucketKey];

      data.push(bucketData);
    }

    return data;
  }, [statistics, bucket, intl.locale]);

  return (
    <div className="flex flex-col rounded-lg border border-gray-300 p-6 shadow-lg sm:col-span-3 dark:border-gray-700">
      <span className="text-base">
        <FormattedMessage
          id="general.issue_duration_this_period"
          defaultMessage="Issue duration {period}"
          values={{
            period: (
              <FormattedRelativeTime
                value={0}
                unit={bucket.data.unit}
                numeric="auto"
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
                duration={Duration.fromMillis(
                  chartData[chartData.length - 1].durationMsByIssueType
                    .disruption,
                )}
              />
            ),
          }}
        />
      </span>
      <span className="text-gray-400 text-sm dark:text-gray-500">
        <FormattedMessage
          id="general.change_since_last_period"
          defaultMessage="{change} from {period}"
          values={{
            change: (
              <FormattedDuration
                signDisplay="always"
                duration={Duration.fromMillis(
                  chartData[chartData.length - 1].durationMsByIssueType
                    .disruption -
                    chartData[chartData.length - 2].durationMsByIssueType
                      .disruption,
                )
                  .rescale()
                  .set({ seconds: 0 })
                  .rescale()}
              />
            ),
            period: (
              <FormattedRelativeTime
                value={-1}
                unit={bucket.data.unit}
                numeric="auto"
              />
            ),
          }}
        />
      </span>
      <div className="mt-4 h-48">
        <ResponsiveContainer>
          <LineChart
            accessibilityLayer
            data={chartData}
            layout="horizontal"
            margin={{ top: 30, left: 5, right: 5, bottom: 5 }}
          >
            <CartesianGrid
              vertical={false}
              className="stroke-gray-300 dark:stroke-gray-600"
            />
            <XAxis
              type="category"
              dataKey="bucketLabel"
              className="text-gray-600 text-sm dark:text-gray-300"
            />
            <Tooltip
              formatter={displayMsFormatter}
              // @ts-expect-error typing issue
              content={CustomTooltip}
            />
            <Line
              dataKey="durationMsByIssueType.disruption"
              className="stroke-disruption-light dark:stroke-disruption-dark"
              stroke=""
              radius={5}
              type="monotone"
              strokeWidth={2}
            />

            <Line
              dataKey="durationMsByIssueType.maintenance"
              className="stroke-maintenance-light dark:stroke-maintenance-dark"
              stroke=""
              radius={5}
              type="monotone"
              strokeWidth={2}
            />

            <Line
              dataKey="durationMsByIssueType.infra"
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
        {BUCKETS.map((optionBucket) => (
          <button
            key={`${optionBucket.data.unit}:${optionBucket.data.count}`}
            className={classNames(
              'px-2 py-0.5 text-xs',
              optionBucket.data.unit === bucket.data.unit &&
                optionBucket.data.count === bucket.data.count
                ? 'bg-gray-400 text-gray-50 dark:bg-gray-500 dark:text-gray-200'
                : 'text-gray-400 dark:text-gray-500',
            )}
            type="button"
            onClick={() => setBucket(optionBucket)}
          >
            <FormattedNumber
              value={optionBucket.display?.count ?? optionBucket.data.count}
              style="unit"
              unit={optionBucket.display?.unit ?? optionBucket.data.unit}
            />
          </button>
        ))}
      </div>
    </div>
  );
};
