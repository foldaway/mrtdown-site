import { FormattedDate, FormattedMessage, useIntl } from 'react-intl';
import type { LineBranch } from '~/client';

interface Props {
  branch: LineBranch;
}

export const BranchItem: React.FC<Props> = (props) => {
  const { branch } = props;

  const intl = useIntl();

  return (
    <div className="flex flex-col">
      <span className="font-medium">
        {branch.titleTranslations[intl.locale] ?? branch.title}
      </span>
      {branch.startedAt == null ? (
        <span className="text-gray-500 text-xs dark:text-gray-400">
          <FormattedMessage
            id="status.future_service"
            defaultMessage="Under Development"
          />
        </span>
      ) : branch.endedAt != null ? (
        <span className="text-gray-500 text-xs dark:text-gray-400">
          <FormattedMessage
            id="line.branch.closed"
            defaultMessage="Closed in {year}"
            values={{
              year: <FormattedDate year="numeric" value={branch.endedAt} />,
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
