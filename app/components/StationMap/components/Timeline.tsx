import { ClockIcon } from '@heroicons/react/24/outline';
import { Tabs } from 'radix-ui';
import type React from 'react';
import { TimelineConnector } from './TimelineConnector';
import { TimelineDateTrigger } from './TimelineDateTrigger';
import { TimelineHeader } from './TimelineHeader';

interface TimelineProps {
  currentDate?: string;
}

export const Timeline: React.FC<TimelineProps> = ({ currentDate }) => {
  const dates = [
    { value: '2012-01', showIcon: false, isCurrent: false },
    { value: '2017-11', showIcon: false, isCurrent: false },
    { value: '2019-12', showIcon: false, isCurrent: false },
    { value: '2024-11', showIcon: false, isCurrent: false },
    { value: '2025-04', showIcon: false, isCurrent: true },
    { value: '2027-12', showIcon: true, isCurrent: false },
    { value: '2029-12', showIcon: true, isCurrent: false },
    { value: '2030-12', showIcon: true, isCurrent: false },
    { value: '2032-12', showIcon: true, isCurrent: false },
  ];

  const timelineElements: React.ReactNode[] = [];

  dates.forEach((date, index) => {
    timelineElements.push(
      <TimelineDateTrigger
        key={date.value}
        value={date.value}
        showIcon={date.showIcon}
        isCurrent={date.isCurrent}
        icon={date.showIcon ? <ClockIcon /> : undefined}
      />,
    );

    if (index < dates.length - 1) {
      timelineElements.push(
        <TimelineConnector
          key={`connector-${date.value}`}
          isBlueTransition={
            date.isCurrent ||
            (index < dates.length - 1 && dates[index + 1]?.isCurrent)
          }
        />,
      );
    }
  });

  return (
    <div className="border-gray-300 border-b bg-gradient-to-b from-slate-900 to-slate-800 px-2 py-3 sm:px-4 sm:py-4 dark:border-slate-700 dark:from-slate-950 dark:to-slate-900">
      <TimelineHeader currentDate={currentDate} />
      <Tabs.List className="flex items-center gap-0.5 overflow-x-auto [scrollbar-width:thin] sm:gap-1">
        {timelineElements}
      </Tabs.List>
    </div>
  );
};
