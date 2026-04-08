import classNames from 'classnames';
import { FormattedMessage, useIntl } from 'react-intl';
import { useIncludedEntities } from '~/contexts/IncludedEntities';

interface Props {
  active?: boolean;
  payload?: {
    dataKey?: string | number;
    value?: string;
  }[];
  label?: string;
}

export const TooltipContent: React.FC<Props> = ({ active, payload, label }) => {
  const isVisible = active && payload && payload.length;

  const intl = useIntl();
  const { stations } = useIncludedEntities();

  if (label == null) {
    return null;
  }

  const station = stations[label];

  return (
    <div
      className="custom-tooltip"
      style={{ visibility: isVisible ? 'visible' : 'hidden' }}
    >
      {isVisible && (
        <div className="z-50 flex w-52 flex-col rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-lg outline-none ring-1 ring-black/5 backdrop-blur-sm dark:border-gray-700 dark:bg-gray-800 dark:ring-white/10">
          <span className="mb-2 font-semibold text-gray-900 text-sm dark:text-gray-100">
            {station.nameTranslations[intl.locale] ?? station.name}
          </span>
          {payload.map((item) => (
            <div key={item.dataKey} className="flex items-center py-0.5">
              <div
                className={classNames('me-2 size-3 rounded-full', {
                  'bg-disruption-light dark:bg-disruption-dark':
                    item.dataKey === 'payload.disruption',
                  'bg-maintenance-light dark:bg-maintenance-dark':
                    item.dataKey === 'payload.maintenance',
                  'bg-infra-light dark:bg-infra-dark':
                    item.dataKey === 'payload.infra',
                })}
              />
              <span className="font-medium text-gray-700 text-xs capitalize dark:text-gray-200">
                {item.dataKey === 'payload.disruption' && (
                  <FormattedMessage
                    id="general.disruption"
                    defaultMessage="Disruption"
                  />
                )}
                {item.dataKey === 'payload.maintenance' && (
                  <FormattedMessage
                    id="general.maintenance"
                    defaultMessage="Maintenance"
                  />
                )}
                {item.dataKey === 'payload.infra' && (
                  <FormattedMessage
                    id="general.infrastructure"
                    defaultMessage="Infrastructure"
                  />
                )}
              </span>
              <span className="ms-auto text-gray-600 text-xs dark:text-gray-300">
                {item.value}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
