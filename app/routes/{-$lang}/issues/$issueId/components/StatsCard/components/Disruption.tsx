import { Duration } from 'luxon';
import { useMemo } from 'react';
import { FormattedMessage, FormattedNumber } from 'react-intl';
import type { Issue } from '~/client';
import { FormattedDuration } from '~/components/FormattedDuration';

interface Props {
  issue: Issue;
}

export const Disruption: React.FC<Props> = (props) => {
  const { issue } = props;

  const stationCount = useMemo(() => {
    const stationIds = new Set<string>();

    for (const branch of issue.branchesAffected) {
      for (const stationId of branch.stationIds) {
        stationIds.add(stationId);
      }
    }

    return stationIds.size;
  }, [issue.branchesAffected]);

  return (
    <>
      <div className="flex flex-col justify-center rounded-lg bg-gray-100 p-4 text-center dark:bg-gray-700">
        <dd className="font-bold text-2xl text-gray-800 dark:text-gray-200">
          {stationCount}
        </dd>
        <dt className="text-gray-400 text-sm uppercase">
          <FormattedMessage
            id="issue.details.stations_affected"
            defaultMessage="Stations affected"
          />
        </dt>
      </div>
      <div className="flex-col justify-center rounded-lg bg-gray-100 p-4 text-center dark:bg-gray-700">
        <dd className="font-bold text-2xl text-gray-800 dark:text-gray-200">
          <FormattedDuration
            duration={Duration.fromObject({ seconds: issue.durationSeconds })}
          />
        </dd>
        <dt className="text-gray-400 text-sm uppercase">
          <FormattedMessage
            id="issue.details.total_duration"
            defaultMessage="Total duration"
          />
        </dt>
      </div>
      <div className="flex-col justify-center rounded-lg bg-gray-100 p-4 text-center dark:bg-gray-700">
        <dd className="font-bold text-2xl text-gray-800 dark:text-gray-200">
          <FormattedNumber value={issue.lineIds.length} />
        </dd>
        <dt className="text-gray-400 text-sm uppercase">
          <FormattedMessage
            id="issue.details.lines_affected"
            defaultMessage="Lines affected"
          />
        </dt>
      </div>
    </>
  );
};
