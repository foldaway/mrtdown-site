import { Fragment } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { Link } from 'react-router';
import { useIncludedEntities } from '~/contexts/IncludedEntities';
import { buildLocaleAwareLink } from '~/helpers/buildLocaleAwareLink';

interface Props {
  lineId: string;
  stationIds: string[];
}

export const StationInterchangesCard: React.FC<Props> = (props) => {
  const { lineId, stationIds } = props;

  const intl = useIntl();

  const { stations, lines } = useIncludedEntities();

  return (
    <div className="flex flex-col rounded-lg border border-gray-300 p-6 text-gray-800 shadow-lg md:col-span-4 dark:border-gray-700 dark:text-gray-200">
      <span className="mb-2 font-semibold text-base text-gray-900 dark:text-white">
        <FormattedMessage
          id="general.interchanges"
          defaultMessage="Interchanges"
        />
      </span>
      <div className="card-body">
        {stationIds.length === 0 ? (
          <div className="flex items-center justify-center rounded-lg border-2 border-gray-300 border-dashed py-12 dark:border-gray-600">
            <p className="text-gray-500 dark:text-gray-400">
              <FormattedMessage
                id="interchanges.empty"
                defaultMessage="No interchanges found"
              />
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-y-2">
            {stationIds.map((stationId) => (
              <Fragment key={stationId}>
                <div className="relative flex items-center gap-x-1.5">
                  <div className="flex items-center overflow-hidden rounded-md">
                    {Object.entries(
                      Object.fromEntries(
                        stations[stationId].memberships.map((membership) => {
                          const key = `${membership.code}@${membership.lineId}`;
                          return [key, membership];
                        }),
                      ),
                    )
                      .sort((a, b) => {
                        if (a[1].lineId === lineId) {
                          return -1;
                        }
                        if (b[1].lineId === lineId) {
                          return 1;
                        }
                        return 0;
                      })
                      .map(([key, membership]) => (
                        <div
                          key={key}
                          className="z-10 flex h-4 w-10 items-center justify-center px-1.5"
                          style={{
                            backgroundColor: lines[membership.lineId].color,
                          }}
                        >
                          <span className="font-semibold text-white text-xs leading-none">
                            {membership.code}
                          </span>
                        </div>
                      ))}
                  </div>
                  <div className="flex">
                    <Link
                      to={buildLocaleAwareLink(
                        `/stations/${stationId}`,
                        intl.locale,
                      )}
                      className="group flex"
                    >
                      <span className="text-gray-800 text-sm group-hover:underline dark:text-gray-200">
                        {stations[stationId].nameTranslations[intl.locale] ??
                          stations[stationId].name}
                      </span>
                    </Link>
                  </div>
                </div>
              </Fragment>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
