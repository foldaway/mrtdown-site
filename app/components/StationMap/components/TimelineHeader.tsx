import { FormattedDate } from 'react-intl';

interface TimelineHeaderProps {
  currentDate?: string;
}

export const TimelineHeader: React.FC<TimelineHeaderProps> = ({
  currentDate,
}) => {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-4 sm:mb-4">
      <span className="font-semibold text-slate-300 text-xs uppercase tracking-wider dark:text-slate-400">
        Timeline
      </span>
      <span className="text-right font-medium text-slate-400 text-sm dark:text-slate-300">
        <FormattedDate
          value={currentDate || '2025-04'}
          year="numeric"
          month="long"
        />
      </span>
    </div>
  );
};
