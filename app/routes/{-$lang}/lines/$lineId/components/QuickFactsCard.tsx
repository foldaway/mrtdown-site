import { InformationCircleIcon } from '@heroicons/react/20/solid';
import { Link } from '@tanstack/react-router';
import { DateTime } from 'luxon';
import { Tooltip } from 'radix-ui';
import { useCallback, useMemo } from 'react';
import {
  FormattedDateTimeRange,
  FormattedMessage,
  FormattedNumber,
  useIntl,
} from 'react-intl';
import { useIncludedEntities } from '~/contexts/IncludedEntities';
import { getLocalizedTranslation } from '~/helpers/getLocalizedTranslation';
import type { Line } from '~/types';

interface Props {
  line: Line;
  stationCount: number;
}

export const QuickFactsCard: React.FC<Props> = (props) => {
  const { line, stationCount } = props;
  const included = useIncludedEntities();
  const intl = useIntl();

  // Fake DateTime used for display purposes
  const generateFakeDateTime = useCallback((isoTime: string) => {
    const now = DateTime.now();
    return DateTime.fromISO(`${now.toISODate()}T${isoTime}`);
  }, []);

  const currentOperators = useMemo(() => {
    return line.operators
      .filter((op) => op.endedAt == null)
      .map((lineOperator) => {
        const operator = included.operators[lineOperator.operatorId];
        if (operator == null) {
          return null;
        }
        return {
          id: operator.id,
          name: getLocalizedTranslation(operator.name, intl.locale),
        };
      })
      .filter((op): op is { id: string; name: string } => op != null);
  }, [line.operators, included.operators, intl.locale]);

  return (
    <section className="flex flex-col px-4 py-3 text-gray-800 sm:px-5 sm:py-4 dark:text-gray-200">
      <h2 className="font-semibold text-gray-900 text-sm leading-5 dark:text-gray-100">
        <FormattedMessage
          id="general.quick_facts"
          defaultMessage="Quick Facts"
        />
      </h2>
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
        <span className="text-gray-600 text-sm dark:text-gray-400">
          <FormattedMessage id="general.operator" defaultMessage="Operator" />
        </span>
        <span className="justify-self-end font-medium text-sm">
          {currentOperators.length > 0 ? (
            <span className="flex flex-wrap items-center justify-end gap-x-1">
              {currentOperators.map((operator, index) => (
                <span key={operator.id}>
                  {index > 0 && (
                    <span className="text-gray-500 dark:text-gray-400">, </span>
                  )}
                  <Link
                    to="/{-$lang}/operators/$operatorId"
                    params={{ operatorId: operator.id }}
                    className="text-blue-600 hover:underline dark:text-blue-400"
                  >
                    {operator.name}
                  </Link>
                </span>
              ))}
            </span>
          ) : (
            <FormattedMessage id="general.unknown" defaultMessage="Unknown" />
          )}
        </span>

        <span className="text-gray-600 text-sm dark:text-gray-400">
          <FormattedMessage id="general.stations" defaultMessage="Stations" />
        </span>
        <span className="justify-self-end font-medium text-sm">
          <FormattedNumber value={stationCount} />
        </span>
      </div>

      <hr className="my-3 border-gray-200 dark:border-gray-700" />

      <div className="mb-2 flex items-center gap-1">
        <span className="text-gray-500 text-xs dark:text-gray-400">
          <FormattedMessage
            id="general.operating_hours"
            defaultMessage="Operating Hours"
          />
        </span>
        <Tooltip.Provider delayDuration={100}>
          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <button
                type="button"
                className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
                aria-label="Information about operating hours"
              >
                <InformationCircleIcon className="size-4" />
              </button>
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content
                className="z-50 max-w-xs rounded-md bg-gray-900 px-3 py-2 text-white text-xs shadow-lg dark:bg-gray-700"
                sideOffset={4}
              >
                <FormattedMessage
                  id="general.operating_hours_tooltip"
                  defaultMessage="Approximate hours for the entire line. Individual stations may vary."
                />
                <Tooltip.Arrow className="fill-gray-900 dark:fill-gray-700" />
              </Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>
        </Tooltip.Provider>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        <span className="text-gray-600 text-sm dark:text-gray-400">
          <FormattedMessage id="general.weekdays" defaultMessage="Weekdays" />
        </span>
        <span className="justify-self-end text-sm">
          <FormattedDateTimeRange
            from={generateFakeDateTime(
              line.operatingHours.weekdays.start,
            ).toMillis()}
            to={generateFakeDateTime(
              line.operatingHours.weekdays.end,
            ).toMillis()}
            timeStyle="short"
          />
        </span>
        <span className="text-gray-600 text-sm dark:text-gray-400">
          <FormattedMessage id="general.weekends" defaultMessage="Weekends" />
        </span>
        <span className="justify-self-end text-sm">
          <FormattedDateTimeRange
            from={generateFakeDateTime(
              line.operatingHours.weekends.start,
            ).toMillis()}
            to={generateFakeDateTime(
              line.operatingHours.weekends.end,
            ).toMillis()}
            timeStyle="short"
          />
        </span>
      </div>
    </section>
  );
};
