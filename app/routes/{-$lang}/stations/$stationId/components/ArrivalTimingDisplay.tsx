import type { ReactNode } from 'react';
import { FormattedMessage } from 'react-intl';

type ArrivalTimingDisplayProps = {
  children: ReactNode;
  reportButton?: ReactNode;
};

export function ArrivalTimingDisplay({
  children,
  reportButton,
}: ArrivalTimingDisplayProps) {
  return (
    <div className="flex items-center gap-1 rounded-lg bg-gray-50 px-1.5 py-1.5 text-start ring-1 ring-gray-200/80 ring-inset dark:bg-gray-900/45 dark:ring-white/10">
      <div className="flex min-h-7 min-w-0 flex-1 flex-wrap content-center items-baseline gap-x-2 gap-y-1 tabular-nums">
        {children}
      </div>
      {reportButton && <div className="shrink-0">{reportButton}</div>}
    </div>
  );
}

type ArrivalTimeValueProps = {
  children: ReactNode;
  unavailable?: boolean;
};

export function ArrivalTimeValue({
  children,
  unavailable,
}: ArrivalTimeValueProps) {
  return (
    <span
      aria-hidden={unavailable || undefined}
      className={`block font-semibold text-xl leading-none tracking-tight sm:text-2xl ${unavailable ? 'text-gray-600 dark:text-gray-400' : 'text-gray-950 dark:text-white'}`}
    >
      {children}
    </span>
  );
}

type NoArrivalTimesProps = { emptyWindow?: boolean };

export function NoArrivalTimes({ emptyWindow }: NoArrivalTimesProps) {
  return (
    <div
      aria-live="polite"
      className="flex min-w-0 max-w-full items-center gap-1.5 [overflow-wrap:anywhere]"
    >
      <ArrivalTimeValue unavailable>—</ArrivalTimeValue>
      <p className="text-gray-600 text-xs leading-snug dark:text-gray-400">
        {emptyWindow ? (
          <FormattedMessage
            id="station.arrivals.empty_window"
            defaultMessage="None in the next hour"
          />
        ) : (
          <FormattedMessage
            id="station.arrivals.timetable_unavailable"
            defaultMessage="Timetable unavailable"
          />
        )}
      </p>
    </div>
  );
}
