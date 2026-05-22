import { DateTime } from 'luxon';
import { FormattedMessage } from 'react-intl';
import { StationMap } from '~/components/StationMap';
import type { LineBranch } from '~/util/db.queries';
import type { Line } from '~/types';

interface Props {
  line: Line;
  branches: LineBranch[];
}

export const LineSystemMapCard: React.FC<Props> = (props) => {
  const { line, branches } = props;

  return (
    <div className="flex flex-col rounded-lg border border-gray-300 p-6 text-gray-800 shadow-lg md:col-span-4 dark:border-gray-700 dark:text-gray-200">
      <span className="mb-2 font-semibold text-base text-gray-900 dark:text-white">
        <FormattedMessage id="general.system_map" defaultMessage="System Map" />
      </span>
      <div className="min-h-0 bg-gray-100 p-3 dark:bg-gray-800">
        <StationMap
          currentDate={DateTime.now().toISODate()}
          mode={{
            type: 'focused-line',
            lineId: line.id,
            branches,
          }}
        />
      </div>
    </div>
  );
};
