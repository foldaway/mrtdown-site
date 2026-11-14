import { Popover } from '@base-ui/react/popover';
import { InformationCircleIcon } from '@heroicons/react/20/solid';
import { FormattedMessage, useIntl } from 'react-intl';
import { getLocalizedTranslation } from '~/helpers/getLocalizedTranslation';
import type { ArrivalTiming } from './stationGuide.types';

type ServiceDetailsPopoverProps = {
  serviceName: ArrivalTiming['serviceName'];
};

export function ServiceDetailsPopover({
  serviceName,
}: ServiceDetailsPopoverProps) {
  const intl = useIntl();
  const label = intl.formatMessage({
    id: 'station.arrival_timings.service_details_label',
    defaultMessage: 'Service details',
  });

  return (
    <Popover.Root>
      <Popover.Trigger
        aria-label={label}
        className="grid size-8 shrink-0 place-items-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
        openOnHover
      >
        <InformationCircleIcon aria-hidden="true" className="size-4" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner
          className="z-50"
          collisionPadding={16}
          sideOffset={8}
        >
          <Popover.Popup
            aria-label={label}
            className="max-w-[calc(100vw-2rem)] rounded-xl border border-gray-200 bg-white px-4 py-3 text-gray-700 text-xs shadow-gray-900/15 shadow-xl outline-none ring-1 ring-black/5 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:shadow-black/30 dark:ring-white/10"
          >
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2">
              <dt className="text-gray-500 dark:text-gray-400">
                <FormattedMessage
                  id="station.arrival_timings.service_label"
                  defaultMessage="Service"
                />
              </dt>
              <dd>{getLocalizedTranslation(serviceName, intl.locale)}</dd>
            </dl>
            <Popover.Arrow className="fill-white dark:fill-gray-800" />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
