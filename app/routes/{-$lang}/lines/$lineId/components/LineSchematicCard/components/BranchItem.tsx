import { DateTime } from 'luxon';
import { FormattedDate, FormattedMessage, useIntl } from 'react-intl';
import { getLocalizedTranslation } from '~/helpers/getLocalizedTranslation';
import type { LineBranch } from '~/util/dbQueries/lines';
import { lineBranchHasEnded, lineBranchIsActiveOn } from '~/util/lineBranches';

interface Props {
  branch: LineBranch;
}

export const BranchItem: React.FC<Props> = (props) => {
  const { branch } = props;

  const intl = useIntl();
  const referenceDate =
    DateTime.now().setZone('Asia/Singapore').toISODate() ?? '';
  const isActive = lineBranchIsActiveOn(branch, referenceDate);
  const hasEnded = lineBranchHasEnded(branch, referenceDate);

  return (
    <div className="flex flex-col">
      <span className="font-medium">
        {getLocalizedTranslation(branch.name, intl.locale)}
      </span>
      {!isActive && !hasEnded ? (
        <span className="text-gray-500 text-xs dark:text-gray-400">
          <FormattedMessage
            id="status.future_service"
            defaultMessage="Under Development"
          />
        </span>
      ) : hasEnded ? (
        <span className="text-gray-500 text-xs dark:text-gray-400">
          <FormattedMessage
            id="line.branch.closed"
            defaultMessage="Closed on {date}"
            values={{
              date: (
                <FormattedDate
                  day="numeric"
                  month="long"
                  year="numeric"
                  value={branch.endedAt ?? undefined}
                />
              ),
            }}
          />
        </span>
      ) : (
        <span className="text-green-600 text-xs dark:text-green-400">
          <FormattedMessage
            id="line.branch.in_service"
            defaultMessage="In Service"
          />
        </span>
      )}
    </div>
  );
};
