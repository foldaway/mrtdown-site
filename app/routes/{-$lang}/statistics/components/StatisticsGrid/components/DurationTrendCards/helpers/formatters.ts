import { Duration } from 'luxon';

export const labelFormatter = (value: number) => {
  if (value === 0) {
    return Duration.fromObject({
      hours: 0,
    }).toHuman({ unitDisplay: 'narrow' });
  }

  const duration = Duration.fromObject({ milliseconds: value });
  if (duration.as('hours') < 1) {
    return duration.shiftTo('minutes').toHuman({ unitDisplay: 'narrow' });
  }

  return duration
    .shiftTo('hours')
    .mapUnits((x) => Math.round(x))
    .toHuman({ unitDisplay: 'narrow' });
};

export const displayMsFormatter = (milliseconds: number) => {
  if (milliseconds === 0) {
    return Duration.fromObject({
      hours: 0,
    }).toHuman();
  }
  return Duration.fromObject({
    milliseconds,
  })
    .rescale()
    .set({ seconds: 0 })
    .rescale()
    .toHuman();
};
