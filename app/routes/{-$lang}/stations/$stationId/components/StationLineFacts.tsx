import { DateTime } from 'luxon';
import { FormattedDate, FormattedMessage } from 'react-intl';
import { StationStructureTypeLabels } from '~/constants';
import type { Station } from '~/types';

type StationLineFactsProps = {
  facts: { membership: Station['memberships'][number]; showCode: boolean }[];
  referenceAt: string;
};

const zone = 'Asia/Singapore';

export function StationLineFacts({
  facts,
  referenceAt,
}: StationLineFactsProps) {
  if (facts.length === 0) return null;

  const referenceDate = DateTime.fromISO(referenceAt, { zone }).toISODate();
  return (
    <ul className="space-y-1 text-gray-600 text-xs dark:text-gray-300">
      {facts.map(({ membership, showCode }) => (
        <li
          className="flex flex-wrap items-baseline gap-x-1.5"
          key={membership.code}
        >
          {showCode && <span className="font-semibold">{membership.code}</span>}
          <span className="font-medium text-gray-800 dark:text-gray-100">
            <FormattedMessage
              {...StationStructureTypeLabels[membership.structureType]}
            />
          </span>
          {referenceDate != null && membership.startedAt <= referenceDate && (
            <>
              <span aria-hidden="true">·</span>
              <span>
                <FormattedMessage id="general.opened" defaultMessage="Opened" />{' '}
                <MembershipDate value={membership.startedAt} />
              </span>
            </>
          )}
          {membership.endedAt != null && (
            <>
              <span aria-hidden="true">·</span>
              <span>
                <FormattedMessage id="general.closed" defaultMessage="Closed" />{' '}
                <MembershipDate value={membership.endedAt} />
              </span>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

type MembershipDateProps = { value: string };

function MembershipDate({ value }: MembershipDateProps) {
  return (
    <time dateTime={value}>
      <FormattedDate
        value={DateTime.fromISO(value, { zone }).toJSDate()}
        day="numeric"
        month="short"
        year="numeric"
        timeZone={zone}
      />
    </time>
  );
}
