import classNames from 'classnames';
import type { IssueType } from '../types';

interface Props {
  issueType?: IssueType;
}

export const IssueSkeleton: React.FC<Props> = (props) => {
  const { issueType = 'disruption' } = props;

  return (
    <div className="flex flex-col">
      <div
        className={classNames('animate-pulse text-lg text-transparent', {
          'bg-disruption-major-light dark:bg-disruption-major-dark':
            issueType === 'disruption',
          'bg-maintenance-light dark:bg-maintenance-dark':
            issueType === 'maintenance',
          'bg-infra-light dark:bg-infra-dark': issueType === 'infra',
        })}
      >
        _
      </div>
      <div className="flex animate-pulse flex-col bg-gray-100 p-4 dark:bg-gray-800">
        <div className="w-48 animate-pulse bg-gray-300 text-transparent text-xs dark:bg-gray-500">
          _
        </div>

        <div className="animate-pulse bg-gray-400 text-sm text-transparent dark:bg-gray-400">
          _<br />_<br />_
        </div>
      </div>
    </div>
  );
};
