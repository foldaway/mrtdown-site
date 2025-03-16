import { DateTime } from 'luxon';
import type React from 'react';
import { useMemo, useState } from 'react';
import {
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  ResponsiveContainer,
  XAxis,
} from 'recharts';
import type { IssueType, Statistics } from '../../../types';
import { assert } from '../../../util/assert';
import classNames from 'classnames';

type Bucket = {
  unit: 'day' | 'month' | 'year';
  count: number;
};

interface DatasetPartial {
  issueType: IssueType;
  dataByBucket: Record<string, DataPartial>;
}

interface Dataset {
  issueType: IssueType;
  data: Data[];
}

interface DataPartial {
  bucketLabel: string;
  issueIds: Set<string>;
}

interface Data {
  bucketLabel: string;
  count: number;
}

interface Props {
  statistics: Statistics;
}

const BUCKETS: Bucket[] = [
  {
    unit: 'day',
    count: 7,
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

  const chartData = useMemo<Dataset[]>(() => {
    const datasetsByIssueType: Record<IssueType, DatasetPartial> = {
      disruption: {
        issueType: 'disruption',
        dataByBucket: {},
      },
      maintenance: {
        issueType: 'maintenance',
        dataByBucket: {},
      },
      infra: {
        issueType: 'infra',
        dataByBucket: {},
      },
    };

    const currentBucketDateTime = DateTime.now().startOf(bucket.unit);

    let format: string;
    switch (bucket.unit) {
      case 'day': {
        format = 'd/M';
        break;
      }
      case 'month': {
        format = 'LLL';
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
      for (const datasetPartial of Object.values(datasetsByIssueType)) {
        datasetPartial.dataByBucket[bucketIso] = {
          bucketLabel: bucketDateTime.toFormat(format),
          issueIds: new Set(),
        };
      }
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
        const dataset = datasetsByIssueType[issue.type] ?? {
          issueType: issue.type,
          dataByBucket: {},
        };
        const bucketData = dataset.dataByBucket[bucketIso] ?? {
          bucketLabel: bucketDateTime.toFormat(format),
          issueIds: new Set(),
        };
        bucketData.issueIds.add(issue.id);
        dataset.dataByBucket[bucketIso] = bucketData;
        datasetsByIssueType[issue.type] = dataset;
      }
    }

    const result: Dataset[] = [];
    for (const dataset of Object.values(datasetsByIssueType)) {
      const data: Data[] = [];

      const bucketKeys = Object.keys(dataset.dataByBucket);
      bucketKeys.sort();

      for (const bucketKey of bucketKeys) {
        const bucketData = dataset.dataByBucket[bucketKey];

        data.push({
          bucketLabel: bucketData.bucketLabel,
          count: bucketData.issueIds.size,
        });
      }

      result.push({
        issueType: dataset.issueType,
        data,
      });
    }

    return result;
  }, [statistics, bucket]);

  return (
    <>
      {chartData.map((dataset) => (
        <div
          key={dataset.issueType}
          className="flex flex-col rounded-lg border border-gray-300 p-6 shadow-lg dark:border-gray-700"
        >
          <span className="text-base">
            {dataset.issueType === 'disruption' && 'Disruptions'}
            {dataset.issueType === 'maintenance' && 'Maintenance events'}
            {dataset.issueType === 'infra' && 'Infrastructure problems'} this{' '}
            {bucket.unit}
          </span>
          <span className="mt-2.5 font-bold text-4xl">
            {dataset.data[dataset.data.length - 1].count}
          </span>
          <span className="text-gray-400 text-sm dark:text-gray-500">
            {new Intl.NumberFormat(undefined, {
              signDisplay: 'always',
            }).format(
              dataset.data[dataset.data.length - 1].count -
                dataset.data[dataset.data.length - 2].count,
            )}{' '}
            from last {bucket.unit}
          </span>
          <div className="h-48 mt-4">
            <ResponsiveContainer>
              <LineChart
                accessibilityLayer
                data={dataset.data}
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
                  dataKey="count"
                  className="stroke-gray-700 dark:stroke-gray-200"
                  stroke=""
                  radius={5}
                  type="monotone"
                  strokeWidth={2}
                >
                  <LabelList
                    position="top"
                    offset={12}
                    className="fill-foreground stroke-gray-400 text-sm dark:stroke-gray-500"
                  />
                </Line>
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="flex self-start items-center border border-gray-300 dark:border-gray-600 rounded-md divide-x divide-gray-300 dark:divide-gray-600">
            {BUCKETS.map((optionBucket) => (
              <button
                key={`${optionBucket.unit}:${optionBucket.count}`}
                className={classNames(
                  'text-xs px-2 py-0.5',
                  optionBucket.unit === bucket.unit &&
                    optionBucket.count === bucket.count
                    ? 'bg-gray-400 dark:bg-gray-500 text-gray-50 dark:text-gray-200'
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
      ))}
    </>
  );
};
