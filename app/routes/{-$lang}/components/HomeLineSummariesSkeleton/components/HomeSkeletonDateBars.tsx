import classNames from 'classnames';

interface HomeSkeletonDateBarsProps {
  dateKeys?: string[];
}

export function HomeSkeletonDateBars(props: HomeSkeletonDateBarsProps) {
  const { dateKeys } = props;

  if (dateKeys != null) {
    return dateKeys.map((dateKey) => <HomeSkeletonDateBar key={dateKey} />);
  }

  return PENDING_DATE_BAR_IDS.map((barId, index) => (
    <HomeSkeletonDateBar
      className={classNames({
        'hidden sm:flex': index >= 30 && index < 60,
        'hidden lg:flex': index >= 60,
      })}
      key={barId}
    />
  ));
}

function HomeSkeletonDateBar(props: { className?: string }) {
  return (
    <div
      className={classNames(
        'flex h-9 min-w-0 items-center justify-center rounded-sm',
        props.className,
      )}
    >
      <div className="h-7 w-full rounded-xs bg-gray-300 dark:bg-gray-700" />
    </div>
  );
}

const PENDING_DATE_BAR_IDS = Array.from(
  { length: 90 },
  (_, index) => `date-bar-${index}`,
);
