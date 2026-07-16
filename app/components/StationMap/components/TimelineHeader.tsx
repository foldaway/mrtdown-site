import { FormattedDate } from 'react-intl';

interface TimelineHeaderProps {
  currentDate?: string;
}

export const TimelineHeader: React.FC<TimelineHeaderProps> = ({
  currentDate,
}) => {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-4 sm:mb-4">
      <span className="font-semibold text-gray-500 text-xs leading-5 dark:text-gray-400">
        Timeline
      </span>
      <span className="text-right font-medium text-gray-700 text-sm leading-5 dark:text-gray-300">
        <FormattedDate
          value={currentDate || '2025-04'}
          year="numeric"
          month="long"
        />
      </span>
    </div>
  );
};
