import { Link } from '@tanstack/react-router';
import classNames from 'classnames';
import { useIntl } from 'react-intl';
import { StationBar } from '~/components/StationBar';
import { getLocalizedTranslation } from '~/helpers/getLocalizedTranslation';
import { isStationMembershipVisibleAt } from '~/helpers/isStationMembershipVisibleAt';
import type { Line, Station } from '~/types';
import type { ResolvedAffectedBranch } from '../affectedAreas';

interface Props {
  branch: ResolvedAffectedBranch;
  line: Line;
  stations: Record<string, Station>;
  referenceAt: string;
  schematic: boolean;
}

export const AffectedStationList: React.FC<Props> = (props) => {
  const { branch, line, stations, referenceAt, schematic } = props;
  const intl = useIntl();

  if (branch.stationIds.length === 0) {
    return (
      <p className="px-3 py-2 text-gray-500 text-xs dark:text-gray-400">
        {intl.formatMessage({
          id: 'issue.station_details_unavailable',
          defaultMessage: 'Station details unavailable for this date',
        })}
      </p>
    );
  }

  const rows = branch.stationIds.flatMap((stationId, index) => {
    const station = stations[stationId];
    if (station == null) return [];
    const memberships = [
      ...new Map(
        station.memberships
          .filter((membership) =>
            isStationMembershipVisibleAt(membership, referenceAt),
          )
          .map((membership) => [
            `${membership.lineId}:${membership.code}`,
            membership,
          ]),
      ).values(),
    ].sort((first, second) => {
      if (first.lineId === line.id) return -1;
      if (second.lineId === line.id) return 1;
      return first.lineId.localeCompare(second.lineId);
    });
    return [{ stationId, station, memberships, index }];
  });

  return (
    <ol
      className={classNames(
        'border-gray-200 border-t px-3 dark:border-gray-700',
        {
          'space-y-1 py-2': !schematic,
          'py-1.5': schematic,
        },
      )}
    >
      {rows.map(({ stationId, station, memberships, index }) => (
        <li
          key={`${stationId}:${index}`}
          className={classNames('relative flex items-center gap-2', {
            'min-h-6 pl-5': schematic,
          })}
        >
          {schematic && (
            <>
              {rows.length > 1 && (
                <span
                  aria-hidden="true"
                  className={classNames('absolute left-[7px] w-0.5', {
                    'top-1/2 bottom-0': index === 0,
                    'top-0 bottom-1/2': index === rows.length - 1,
                    'top-0 bottom-0': index > 0 && index < rows.length - 1,
                  })}
                  style={{ backgroundColor: line.color }}
                />
              )}
              <span
                aria-hidden="true"
                className="-translate-y-1/2 absolute top-1/2 left-[4px] size-2 rounded-full ring-2 ring-gray-50 dark:ring-gray-800"
                style={{ backgroundColor: line.color }}
              />
            </>
          )}
          <StationBar memberships={memberships} />
          <Link
            to="/{-$lang}/stations/$stationId"
            params={{ stationId }}
            className="min-w-0 text-gray-700 text-xs hover:underline dark:text-gray-300"
          >
            {getLocalizedTranslation(station.name, intl.locale)}
          </Link>
        </li>
      ))}
    </ol>
  );
};
