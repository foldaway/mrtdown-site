import { Tabs } from '../../BaseUI';
import { FormattedDate } from 'react-intl';

interface TimelineDateTriggerProps {
  value: string;
  showIcon?: boolean;
  isCurrent?: boolean;
  icon?: React.ReactNode;
}

export const TimelineDateTrigger: React.FC<TimelineDateTriggerProps> = ({
  value,
  showIcon = false,
  isCurrent = false,
  icon,
}) => {
  const baseClassName =
    'group flex shrink-0 cursor-pointer flex-col items-center gap-1 rounded-lg px-1.5 py-2 transition-colors duration-150 hover:bg-gray-100 data-active:bg-blue-600 data-active:shadow-sm sm:gap-1.5 sm:px-2 sm:py-3 dark:hover:bg-gray-700 dark:data-active:bg-blue-600';

  const textClassName = isCurrent
    ? 'font-semibold text-gray-700 group-data-active:text-white dark:text-gray-200'
    : 'font-medium text-gray-500 group-data-active:text-white dark:text-gray-400';

  const dotClassName = isCurrent
    ? 'h-1.5 w-1.5 rounded-full bg-blue-600 transition-all group-data-active:bg-white sm:h-2 sm:w-2'
    : 'h-1 w-1 rounded-full bg-gray-300 transition-all group-data-active:h-1.5 group-data-active:w-1.5 group-data-active:bg-white sm:h-1.5 sm:w-1.5 dark:bg-gray-600';

  return (
    <Tabs.Trigger value={value} className={baseClassName}>
      <div className="flex items-center gap-0.5 sm:gap-1">
        <div className={`text-xs ${textClassName}`}>
          <FormattedDate value={value} year="numeric" />
        </div>
        {showIcon && icon && (
          <div className="h-2 w-2 text-gray-400 opacity-0 transition-opacity group-hover:opacity-100 group-data-active:text-white group-data-active:opacity-100 sm:h-2.5 sm:w-2.5 dark:text-gray-500">
            {icon}
          </div>
        )}
      </div>
      <div className={dotClassName} />
    </Tabs.Trigger>
  );
};
