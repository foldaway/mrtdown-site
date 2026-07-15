import { Link } from '@tanstack/react-router';
import { Fragment } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { useIncludedEntities } from '~/contexts/IncludedEntities';
import { getLocalizedTranslation } from '~/helpers/getLocalizedTranslation';
import { isStationMembershipVisibleAt } from '~/helpers/isStationMembershipVisibleAt';

interface Props {
  lineId: string;
  /** Point in time used to resolve historically valid station codes. */
  referenceAt: string;
  stationIds: string[];
}

/**
 * Lists interchange stations and the codes valid at the line profile's
 * reference time.
 */
export const StationInterchangesCard: React.FC<Props> = (props) => {
  const { lineId, referenceAt, stationIds } = props;

  const intl = useIntl();

  const { stations, lines } = useIncludedEntities();

  return (
    <section className="flex flex-col px-4 py-3 text-gray-800 sm:px-5 sm:py-4 dark:text-gray-200">
      <h2 className="font-semibold text-gray-900 text-sm leading-5 dark:text-gray-100">
        <FormattedMessage
          id="general.interchanges"
          defaultMessage="Interchanges"
        />
      </h2>
      <div className="mt-3">
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
                <li className="relative flex items-center gap-x-2">
                  <div className="flex items-center overflow-hidden rounded-md">
                    {Object.entries(
                      Object.fromEntries(
                        stations[stationId].memberships
                          .filter((membership) =>
                            isStationMembershipVisibleAt(
                              membership,
                              referenceAt,
                            ),
                          )
                          .map((membership) => {
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
                      to="/{-$lang}/stations/$stationId"
                      params={{ stationId }}
                      className="group flex"
                    >
                      <span className="text-gray-800 text-sm group-hover:underline dark:text-gray-200">
                        {getLocalizedTranslation(
                          stations[stationId].name,
                          intl.locale,
                        )}
                      </span>
                    </Link>
                  </div>
                </li>
              </Fragment>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
};
