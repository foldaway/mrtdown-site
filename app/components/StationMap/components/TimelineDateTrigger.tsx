import { Tabs } from 'radix-ui';
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
    'group flex shrink-0 cursor-pointer flex-col items-center gap-1 rounded-md px-1.5 py-2 transition-all duration-200 sm:gap-1.5 sm:px-2 sm:py-3';

  const stateClassName = isCurrent
    ? 'bg-blue-500/20 hover:bg-blue-500/30 data-[state=active]:bg-blue-500/30 data-[state=active]:shadow-sm dark:bg-blue-500/15 dark:data-[state=active]:bg-blue-500/25 dark:hover:bg-blue-500/25'
    : 'hover:bg-slate-700 data-[state=active]:bg-slate-700 data-[state=active]:shadow-sm dark:data-[state=active]:bg-slate-700 dark:hover:bg-slate-700';

  const textClassName = isCurrent
    ? 'font-semibold text-blue-300 dark:text-blue-300'
    : 'font-medium text-slate-400 group-data-[state=active]:text-slate-100 dark:text-slate-500 dark:group-data-[state=active]:text-slate-200';

  const dotClassName = isCurrent
    ? 'h-1 w-1 rounded-full bg-blue-400 transition-all group-data-[state=active]:h-1.5 group-data-[state=active]:w-1.5 sm:h-1.5 sm:w-2 sm:group-data-[state=active]:h-2 sm:group-data-[state=active]:w-2.5 dark:bg-blue-400'
    : 'h-0.5 w-1 rounded-full bg-slate-600 transition-all group-data-[state=active]:h-1 group-data-[state=active]:w-1.5 group-data-[state=active]:bg-slate-300 sm:h-1 sm:w-1.5 sm:group-data-[state=active]:h-2 sm:group-data-[state=active]:w-2 dark:group-data-[state=active]:bg-slate-300';

  return (
    <Tabs.Trigger
      value={value}
      className={`${baseClassName} ${stateClassName}`}
    >
      <div className="flex items-center gap-0.5 sm:gap-1">
        <div className={`text-xs ${textClassName}`}>
          <FormattedDate value={value} year="numeric" />
        </div>
        {showIcon && icon && (
          <div className="h-2 w-2 text-slate-500 opacity-0 transition-opacity group-hover:opacity-100 group-data-[state=active]:opacity-100 sm:h-2.5 sm:w-2.5 dark:text-slate-500">
            {icon}
          </div>
        )}
      </div>
      <div className={dotClassName} />
    </Tabs.Trigger>
  );
};
