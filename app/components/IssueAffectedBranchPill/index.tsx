import classNames from 'classnames';
import { useIntl } from 'react-intl';
import type { IssueAffectedBranch } from '~/client';
import { useAffectedStations } from '~/components/IssueAffectedBranchPill/hooks/useAffectedStations';

interface Props {
  branch: IssueAffectedBranch;
  className?: string;
}

export const IssueAffectedBranchPill: React.FC<Props> = (props) => {
  const { branch, className } = props;

  const intl = useIntl();
  const { line, source, destination } = useAffectedStations(branch);

  const renderStationRange = () => {
    if (source == null) return null;

    const sourceName =
      source.nameTranslations[intl.locale] ?? source.name ?? 'N/A';
    const destinationName =
      destination != null
        ? (destination.nameTranslations[intl.locale] ??
          destination.name ??
          'N/A')
        : null;

    if (destination) {
      return `${sourceName} ↔ ${destinationName}`;
    }

    return sourceName;
  };

  return (
    <div
      className={classNames(
        'flex items-center gap-x-2 rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 transition-colors hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-700 dark:hover:bg-gray-600',
        className,
      )}
      role="img"
      aria-label={`${line.id} line: ${renderStationRange()}`}
    >
      <div className="flex items-center gap-x-1.5">
        <span
          className="rounded px-1.5 py-0.5 font-semibold text-white text-xs"
          style={{ backgroundColor: line.color }}
        >
          {line.id}
        </span>
      </div>

      <span className="font-medium text-gray-600 text-xs dark:text-gray-300">
        {renderStationRange()}
      </span>
    </div>
  );
};
