import type { Duration } from 'luxon';
import type React from 'react';
import {
  FormattedList,
  FormattedMessage,
  FormattedNumber,
  useIntl,
} from 'react-intl';
import { useHydrated } from '~/hooks/useHydrated';

interface Props extends Intl.NumberFormatOptions {
  duration: Duration;
}

export const FormattedDuration: React.FC<Props> = (props) => {
  const { duration, ...otherProps } = props;

  const isHydrated = useHydrated();
  const intl = useIntl();

  if (duration.toMillis() === 0) {
    return (
      <FormattedNumber value={0} unit="minute" style="unit" {...otherProps} />
    );
  }

  if (isHydrated && 'DurationFormat' in Intl) {
    // @ts-expect-error missing types https://github.com/microsoft/TypeScript/issues/60608
    return new Intl.DurationFormat(intl.locale).format(
      duration.shiftToAll().toObject(),
      otherProps,
    );
  }

  return (
    <FormattedList
      type="conjunction"
      value={Object.entries(duration.toObject()).map(([key, value]) => (
        <FormattedNumber
          key={key}
          value={value}
          unit={key.substring(0, key.length - 1)}
          unitDisplay="short"
          style="unit"
          {...otherProps}
        />
      ))}
    />
  );
};
