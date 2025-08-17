import { DateTime } from 'luxon';
import { FormattedDateTimeRange, FormattedMessage } from 'react-intl';
import type { IssueInterval } from '~/client';

interface Props {
  interval: IssueInterval;
  className?: string;
}

export const IssueTimestamp: React.FC<Props> = (props) => {
  const { interval, className } = props;

  return (
    <span className={className}>
      {interval.endAt != null ? (
        <FormattedDateTimeRange
          timeStyle="short"
          dateStyle="medium"
          from={DateTime.fromISO(interval.startAt).toMillis()}
          to={DateTime.fromISO(interval.endAt).toMillis()}
        />
      ) : (
        <FormattedMessage
          id="general.ongoing_timestamp"
          defaultMessage="{start, date, medium} {start, time, short} to present"
          values={{
            start: DateTime.fromISO(interval.startAt).toMillis(),
          }}
        />
      )}
    </span>
  );
};
