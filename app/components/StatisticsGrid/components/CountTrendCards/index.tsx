import { DateTime } from 'luxon';
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
import classNames from 'classnames';
import type { Data, DataPartial } from './types';
import { CustomTooltip } from './components/CustomTooltip';

type Bucket = {
  unit: 'day' | 'month' | 'year';
  count: number;
};

interface Props {
  statistics: Statistics;
}

const BUCKETS: Bucket[] = [
  {
    unit: 'day',
    count: 7,
  },
  {
    unit: 'day',
    count: 28,
  },
  {
    unit: 'month',
    count: 6,
  },
  {
    unit: 'year',
    count: 10,
  },
  {
    unit: 'year',
    count: 20,
  },
];

export const CountTrendCards: React.FC<Props> = (props) => {
  const { statistics } = props;

  const [bucket, setBucket] = useState<Bucket>({
    unit: 'month',
    count: 6,
  });

  const chartData = useMemo<Data[]>(() => {
    const dataByBucket: Record<string, DataPartial> = {};

    const currentBucketDateTime = DateTime.now().startOf(bucket.unit);

    let format: string;
    switch (bucket.unit) {
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

    for (let i = 0; i < bucket.count; i++) {
      const bucketDateTime = currentBucketDateTime.minus({ [bucket.unit]: i });
      const bucketIso = bucketDateTime.toISODate();
      dataByBucket[bucketIso] = {
        bucketLabel: bucketDateTime.toFormat(format),
        issueIdsByIssueType: {
          disruption: new Set(),
          maintenance: new Set(),
          infra: new Set(),
        },
      };
    }

    for (const [dateIso, dateSummary] of Object.entries(statistics.dates)) {
      const dateTime = DateTime.fromISO(dateIso);
      assert(dateTime.isValid);
      if (
        currentBucketDateTime
          .diff(dateTime.startOf(bucket.unit))
          .as(bucket.unit) >= bucket.count
      ) {
        continue;
      }
      const bucketDateTime = dateTime.startOf(bucket.unit);
      const bucketIso = bucketDateTime.toISODate();
      for (const issue of dateSummary.issues) {
        const bucketData = dataByBucket[bucketIso] ?? {
          bucketLabel: bucketDateTime.toFormat(format),
          issueIdsByIssueType: {},
        };
        bucketData.issueIdsByIssueType[issue.type].add(issue.id);
        dataByBucket[bucketIso] = bucketData;
      }
    }

    const data: Data[] = [];

    const bucketKeys = Object.keys(dataByBucket);
    bucketKeys.sort();

    for (const bucketKey of bucketKeys) {
      const bucketData = dataByBucket[bucketKey];

      const countByIssueType: Data['countByIssueType'] = {
        disruption: 0,
        maintenance: 0,
        infra: 0,
      };

      for (const [issueType, issueIds] of Object.entries(
        bucketData.issueIdsByIssueType,
      )) {
        countByIssueType[issueType as IssueType] = issueIds.size;
      }

      data.push({
        bucketLabel: bucketData.bucketLabel,
        countByIssueType,
      });
    }

    return data;
  }, [statistics, bucket]);

  return (
    <div className="flex flex-col rounded-lg border border-gray-300 p-6 shadow-lg sm:col-span-3 dark:border-gray-700">
      <span className="text-base">Issues this {bucket.unit}</span>
      <span className="mt-2.5 font-bold text-4xl">
        {chartData[chartData.length - 1].countByIssueType.disruption}{' '}
        disruptions
      </span>
      <span className="text-gray-400 text-sm dark:text-gray-500">
        {new Intl.NumberFormat(undefined, {
          signDisplay: 'always',
        }).format(
          chartData[chartData.length - 1].countByIssueType.disruption -
            chartData[chartData.length - 2].countByIssueType.disruption,
        )}{' '}
        from last {bucket.unit}
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
            <Line
              dataKey="countByIssueType.disruption"
              className="stroke-disruption-major-light dark:stroke-disruption-major-dark"
              stroke=""
              radius={5}
              type="monotone"
              strokeWidth={2}
            />
            <Line
              dataKey="countByIssueType.maintenance"
              className="stroke-maintenance-light dark:stroke-maintenance-dark"
              stroke=""
              radius={5}
              type="monotone"
              strokeWidth={2}
            />{' '}
            <Line
              dataKey="countByIssueType.infra"
              className="stroke-infra-light dark:stroke-infra-dark"
              stroke=""
              radius={5}
              type="monotone"
              strokeWidth={2}
            />
            <Tooltip
              // @ts-expect-error typing issue
              content={CustomTooltip}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="flex items-center divide-x divide-gray-300 self-start rounded-md border border-gray-300 dark:divide-gray-600 dark:border-gray-600">
        {BUCKETS.map((optionBucket) => (
          <button
            key={`${optionBucket.unit}:${optionBucket.count}`}
            className={classNames(
              'px-2 py-0.5 text-xs',
              optionBucket.unit === bucket.unit &&
                optionBucket.count === bucket.count
                ? 'bg-gray-400 text-gray-50 dark:bg-gray-500 dark:text-gray-200'
                : 'text-gray-400 dark:text-gray-500',
            )}
            type="button"
            onClick={() => setBucket(optionBucket)}
          >
            {new Intl.NumberFormat(undefined, {
              style: 'unit',
              unit: optionBucket.unit,
            }).format(optionBucket.count)}
          </button>
        ))}
      </div>
    </div>
  );
};
