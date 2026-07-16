import classNames from 'classnames';
import type React from 'react';

interface StatisticsCardProps extends React.PropsWithChildren {
  className?: string;
  contentClassName?: string;
  header: React.ReactNode;
}

export function StatisticsCard(props: StatisticsCardProps) {
  const { children, className, contentClassName, header } = props;

  return (
    <section
      className={classNames(
        'overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800',
        className,
      )}
    >
      <div className="border-gray-200 border-b px-4 py-2.5 sm:px-5 sm:py-3 dark:border-gray-700">
        {header}
      </div>
      <div
        className={classNames('px-4 py-3 sm:px-5 sm:py-4', contentClassName)}
      >
        {children}
      </div>
    </section>
  );
}
